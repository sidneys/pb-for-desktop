// from 'lib/markdown.js'
// Released under MIT license
// Copyright (c) 2009-2010 Dominic Baggott
// Copyright (c) 2009-2010 Ash Berlin
// Copyright (c) 2011 Christoph Dorn <christoph@christophdorn.com> (http://www.christophdorn.com)

(function( expose ) {

/**
 *  class Markdown
 *
 *  Markdown processing in Javascript done right. We have very particular views
 *  on what constitutes 'right' which include:
 *
 *  - produces well-formed HTML (this means that em and strong nesting is
 *    important)
 *
 *  - has an intermediate representation to allow processing of parsed data (We
 *    in fact have two, both as [JsonML]: a markdown tree and an HTML tree).
 *
 *  - is easily extensible to add new dialects without having to rewrite the
 *    entire parsing mechanics
 *
 *  - has a good test suite
 *
 *  This implementation fulfills all of these (except that the test suite could
 *  do with expanding to automatically run all the fixtures from other Markdown
 *  implementations.)
 *
 *  ##### Intermediate Representation
 *
 *  *TODO* Talk about this :) Its JsonML, but document the node names we use.
 *
 *  [JsonML]: http://jsonml.org/ "JSON Markup Language"
 **/
var Markdown = expose.Markdown = function(dialect) {
  switch (typeof dialect) {
    case "undefined":
      this.dialect = Markdown.dialects.Gruber;
      break;
    case "object":
      this.dialect = dialect;
      break;
    default:
      if ( dialect in Markdown.dialects )
        this.dialect = Markdown.dialects[dialect];
      else
        throw new Error("Unknown Markdown dialect '" + String(dialect) + "'");
      break;
  }
  this.em_state = [];
  this.strong_state = [];
  this.debug_indent = "";
};

/**
 *  parse( markdown, [dialect] ) -> JsonML
 *  - markdown (String): markdown string to parse
 *  - dialect (String | Dialect): the dialect to use, defaults to gruber
 *
 *  Parse `markdown` and return a markdown document as a Markdown.JsonML tree.
 **/
expose.parse = function( source, dialect ) {
  // dialect will default if undefined
  var md = new Markdown( dialect );
  return md.toTree( source );
};

/**
 *  toHTML( markdown, [dialect]  ) -> String
 *  toHTML( md_tree ) -> String
 *  - markdown (String): markdown string to parse
 *  - md_tree (Markdown.JsonML): parsed markdown tree
 *
 *  Take markdown (either as a string or as a JsonML tree) and run it through
 *  [[toHTMLTree]] then turn it into a well-formated HTML fragment.
 **/
expose.toHTML = function toHTML( source , dialect , options ) {
  var input = expose.toHTMLTree( source , dialect , options );

  return expose.renderJsonML( input );
};

/**
 *  toHTMLTree( markdown, [dialect] ) -> JsonML
 *  toHTMLTree( md_tree ) -> JsonML
 *  - markdown (String): markdown string to parse
 *  - dialect (String | Dialect): the dialect to use, defaults to gruber
 *  - md_tree (Markdown.JsonML): parsed markdown tree
 *
 *  Turn markdown into HTML, represented as a JsonML tree. If a string is given
 *  to this function, it is first parsed into a markdown tree by calling
 *  [[parse]].
 **/
expose.toHTMLTree = function toHTMLTree( input, dialect , options ) {
  // convert string input to an MD tree
  if ( typeof input === "string" )
    input = this.parse( input, dialect );

  // Now convert the MD tree to an HTML tree

  // remove references from the tree
  var attrs = extract_attr( input ),
      refs = {};

  if ( attrs && attrs.references )
    refs = attrs.references;

  var html = convert_tree_to_html( input, refs , options );
  merge_text_nodes( html );
  return html;
};

// For Spidermonkey based engines
function mk_block_toSource() {
  return "Markdown.mk_block( " +
          uneval(this.toString()) +
          ", " +
          uneval(this.trailing) +
          ", " +
          uneval(this.lineNumber) +
          " )";
}

// node
function mk_block_inspect() {
  var util = require("util");
  return "Markdown.mk_block( " +
          util.inspect(this.toString()) +
          ", " +
          util.inspect(this.trailing) +
          ", " +
          util.inspect(this.lineNumber) +
          " )";

}

var mk_block = Markdown.mk_block = function(block, trail, line) {
  // Be helpful for default case in tests.
  if ( arguments.length === 1 )
    trail = "\n\n";

  // We actually need a String object, not a string primitive
  /* jshint -W053 */
  var s = new String(block);
  s.trailing = trail;
  // To make it clear its not just a string
  s.inspect = mk_block_inspect;
  s.toSource = mk_block_toSource;

  if ( line !== undefined )
    s.lineNumber = line;

  return s;
};

function count_lines( str ) {
  var n = 0,
      i = -1;
  while ( ( i = str.indexOf("\n", i + 1) ) !== -1 )
    n++;
  return n;
}

// Internal - split source into rough blocks
Markdown.prototype.split_blocks = function splitBlocks( input ) {
  input = input.replace(/(\r\n|\n|\r)/g, "\n");
  // [\s\S] matches _anything_ (newline or space)
  // [^] is equivalent but doesn't work in IEs.
  var re = /([\s\S]+?)($|\n#|\n(?:\s*\n|$)+)/g,
      blocks = [],
      m;

  var line_no = 1;

  if ( ( m = /^(\s*\n)/.exec(input) ) !== null ) {
    // skip (but count) leading blank lines
    line_no += count_lines( m[0] );
    re.lastIndex = m[0].length;
  }

  while ( ( m = re.exec(input) ) !== null ) {
    if (m[2] === "\n#") {
      m[2] = "\n";
      re.lastIndex--;
    }
    blocks.push( mk_block( m[1], m[2], line_no ) );
    line_no += count_lines( m[0] );
  }

  return blocks;
};

/**
 *  Markdown#processBlock( block, next ) -> undefined | [ JsonML, ... ]
 *  - block (String): the block to process
 *  - next (Array): the following blocks
 *
 * Process `block` and return an array of JsonML nodes representing `block`.
 *
 * It does this by asking each block level function in the dialect to process
 * the block until one can. Succesful handling is indicated by returning an
 * array (with zero or more JsonML nodes), failure by a false value.
 *
 * Blocks handlers are responsible for calling [[Markdown#processInline]]
 * themselves as appropriate.
 *
 * If the blocks were split incorrectly or adjacent blocks need collapsing you
 * can adjust `next` in place using shift/splice etc.
 *
 * If any of this default behaviour is not right for the dialect, you can
 * define a `__call__` method on the dialect that will get invoked to handle
 * the block processing.
 */
Markdown.prototype.processBlock = function processBlock( block, next ) {
  var cbs = this.dialect.block,
      ord = cbs.__order__;

  if ( "__call__" in cbs )
    return cbs.__call__.call(this, block, next);

  for ( var i = 0; i < ord.length; i++ ) {
    //D:this.debug( "Testing", ord[i] );
    var res = cbs[ ord[i] ].call( this, block, next );
    if ( res ) {
      //D:this.debug("  matched");
      if ( !isArray(res) || ( res.length > 0 && !( isArray(res[0]) ) ) )
        this.debug(ord[i], "didn't return a proper array");
      //D:this.debug( "" );
      return res;
    }
  }

  // Uhoh! no match! Should we throw an error?
  return [];
};

Markdown.prototype.processInline = function processInline( block ) {
  return this.dialect.inline.__call__.call( this, String( block ) );
};

/**
 *  Markdown#toTree( source ) -> JsonML
 *  - source (String): markdown source to parse
 *
 *  Parse `source` into a JsonML tree representing the markdown document.
 **/
// custom_tree means set this.tree to `custom_tree` and restore old value on return
Markdown.prototype.toTree = function toTree( source, custom_root ) {
  var blocks = source instanceof Array ? source : this.split_blocks( source );

  // Make tree a member variable so its easier to mess with in extensions
  var old_tree = this.tree;
  try {
    this.tree = custom_root || this.tree || [ "markdown" ];

    blocks_loop:
    while ( blocks.length ) {
      var b = this.processBlock( blocks.shift(), blocks );

      // Reference blocks and the like won't return any content
      if ( !b.length )
        continue blocks_loop;

      this.tree.push.apply( this.tree, b );
    }
    return this.tree;
  }
  finally {
    if ( custom_root )
      this.tree = old_tree;
  }
};

// Noop by default
Markdown.prototype.debug = function () {
  var args = Array.prototype.slice.call( arguments);
  args.unshift(this.debug_indent);
  if ( typeof print !== "undefined" )
      print.apply( print, args );
  if ( typeof console !== "undefined" && typeof console.log !== "undefined" )
      console.log.apply( null, args );
};

Markdown.prototype.loop_re_over_block = function( re, block, cb ) {
  // Dont use /g regexps with this
  var m,
      b = block.valueOf();

  while ( b.length && (m = re.exec(b) ) !== null ) {
    b = b.substr( m[0].length );
    cb.call(this, m);
  }
  return b;
};

/**
 * Markdown.dialects
 *
 * Namespace of built-in dialects.
 **/
Markdown.dialects = {};

/**
 * Markdown.dialects.Gruber
 *
 * The default dialect that follows the rules set out by John Gruber's
 * markdown.pl as closely as possible. Well actually we follow the behaviour of
 * that script which in some places is not exactly what the syntax web page
 * says.
 **/
Markdown.dialects.Gruber = {
  block: {
    atxHeader: function atxHeader( block, next ) {
      var m = block.match( /^(#{1,6})\s*(.*?)\s*#*\s*(?:\n|$)/ );

      if ( !m )
        return undefined;

      var header = [ "header", { level: m[ 1 ].length } ];
      Array.prototype.push.apply(header, this.processInline(m[ 2 ]));

      if ( m[0].length < block.length )
        next.unshift( mk_block( block.substr( m[0].length ), block.trailing, block.lineNumber + 2 ) );

      return [ header ];
    },

    setextHeader: function setextHeader( block, next ) {
      var m = block.match( /^(.*)\n([-=])\2\2+(?:\n|$)/ );

      if ( !m )
        return undefined;

      var level = ( m[ 2 ] === "=" ) ? 1 : 2,
          header = [ "header", { level : level }, m[ 1 ] ];

      if ( m[0].length < block.length )
        next.unshift( mk_block( block.substr( m[0].length ), block.trailing, block.lineNumber + 2 ) );

      return [ header ];
    },

    code: function code( block, next ) {
      // |    Foo
      // |bar
      // should be a code block followed by a paragraph. Fun
      //
      // There might also be adjacent code block to merge.

      var ret = [],
          re = /^(?: {0,3}\t| {4})(.*)\n?/;

      // 4 spaces + content
      if ( !block.match( re ) )
        return undefined;

      block_search:
      do {
        // Now pull out the rest of the lines
        var b = this.loop_re_over_block(
                  re, block.valueOf(), function( m ) { ret.push( m[1] ); } );

        if ( b.length ) {
          // Case alluded to in first comment. push it back on as a new block
          next.unshift( mk_block(b, block.trailing) );
          break block_search;
        }
        else if ( next.length ) {
          // Check the next block - it might be code too
          if ( !next[0].match( re ) )
            break block_search;

          // Pull how how many blanks lines follow - minus two to account for .join
          ret.push ( block.trailing.replace(/[^\n]/g, "").substring(2) );

          block = next.shift();
        }
        else {
          break block_search;
        }
      } while ( true );

      return [ [ "code_block", ret.join("\n") ] ];
    },

    horizRule: function horizRule( block, next ) {
      // this needs to find any hr in the block to handle abutting blocks
      var m = block.match( /^(?:([\s\S]*?)\n)?[ \t]*([-_*])(?:[ \t]*\2){2,}[ \t]*(?:\n([\s\S]*))?$/ );

      if ( !m )
        return undefined;

      var jsonml = [ [ "hr" ] ];

      // if there's a leading abutting block, process it
      if ( m[ 1 ] ) {
        var contained = mk_block( m[ 1 ], "", block.lineNumber );
        jsonml.unshift.apply( jsonml, this.toTree( contained, [] ) );
      }

      // if there's a trailing abutting block, stick it into next
      if ( m[ 3 ] )
        next.unshift( mk_block( m[ 3 ], block.trailing, block.lineNumber + 1 ) );

      return jsonml;
    },

    // There are two types of lists. Tight and loose. Tight lists have no whitespace
    // between the items (and result in text just in the <li>) and loose lists,
    // which have an empty line between list items, resulting in (one or more)
    // paragraphs inside the <li>.
    //
    // There are all sorts weird edge cases about the original markdown.pl's
    // handling of lists:
    //
    // * Nested lists are supposed to be indented by four chars per level. But
    //   if they aren't, you can get a nested list by indenting by less than
    //   four so long as the indent doesn't match an indent of an existing list
    //   item in the 'nest stack'.
    //
    // * The type of the list (bullet or number) is controlled just by the
    //    first item at the indent. Subsequent changes are ignored unless they
    //    are for nested lists
    //
    lists: (function( ) {
      // Use a closure to hide a few variables.
      var any_list = "[*+-]|\\d+\\.",
          bullet_list = /[*+-]/,
          // Capture leading indent as it matters for determining nested lists.
          is_list_re = new RegExp( "^( {0,3})(" + any_list + ")[ \t]+" ),
          indent_re = "(?: {0,3}\\t| {4})";

      // TODO: Cache this regexp for certain depths.
      // Create a regexp suitable for matching an li for a given stack depth
      function regex_for_depth( depth ) {

        return new RegExp(
          // m[1] = indent, m[2] = list_type
          "(?:^(" + indent_re + "{0," + depth + "} {0,3})(" + any_list + ")\\s+)|" +
          // m[3] = cont
          "(^" + indent_re + "{0," + (depth-1) + "}[ ]{0,4})"
        );
      }
      function expand_tab( input ) {
        return input.replace( / {0,3}\t/g, "    " );
      }

      // Add inline content `inline` to `li`. inline comes from processInline
      // so is an array of content
      function add(li, loose, inline, nl) {
        if ( loose ) {
          li.push( [ "para" ].concat(inline) );
          return;
        }
        // Hmmm, should this be any block level element or just paras?
        var add_to = li[li.length -1] instanceof Array && li[li.length - 1][0] === "para"
                   ? li[li.length -1]
                   : li;

        // If there is already some content in this list, add the new line in
        if ( nl && li.length > 1 )
          inline.unshift(nl);

        for ( var i = 0; i < inline.length; i++ ) {
          var what = inline[i],
              is_str = typeof what === "string";
          if ( is_str && add_to.length > 1 && typeof add_to[add_to.length-1] === "string" )
            add_to[ add_to.length-1 ] += what;
          else
            add_to.push( what );
        }
      }

      // contained means have an indent greater than the current one. On
      // *every* line in the block
      function get_contained_blocks( depth, blocks ) {

        var re = new RegExp( "^(" + indent_re + "{" + depth + "}.*?\\n?)*$" ),
            replace = new RegExp("^" + indent_re + "{" + depth + "}", "gm"),
            ret = [];

        while ( blocks.length > 0 ) {
          if ( re.exec( blocks[0] ) ) {
            var b = blocks.shift(),
                // Now remove that indent
                x = b.replace( replace, "");

            ret.push( mk_block( x, b.trailing, b.lineNumber ) );
          }
          else
            break;
        }
        return ret;
      }

      // passed to stack.forEach to turn list items up the stack into paras
      function paragraphify(s, i, stack) {
        var list = s.list;
        var last_li = list[list.length-1];

        if ( last_li[1] instanceof Array && last_li[1][0] === "para" )
          return;
        if ( i + 1 === stack.length ) {
          // Last stack frame
          // Keep the same array, but replace the contents
          last_li.push( ["para"].concat( last_li.splice(1, last_li.length - 1) ) );
        }
        else {
          var sublist = last_li.pop();
          last_li.push( ["para"].concat( last_li.splice(1, last_li.length - 1) ), sublist );
        }
      }

      // The matcher function
      return function( block, next ) {
        var m = block.match( is_list_re );
        if ( !m )
          return undefined;

        function make_list( m ) {
          var list = bullet_list.exec( m[2] )
                   ? ["bulletlist"]
                   : ["numberlist"];

          stack.push( { list: list, indent: m[1] } );
          return list;
        }


        var stack = [], // Stack of lists for nesting.
            list = make_list( m ),
            last_li,
            loose = false,
            ret = [ stack[0].list ],
            i;

        // Loop to search over block looking for inner block elements and loose lists
        loose_search:
        while ( true ) {
          // Split into lines preserving new lines at end of line
          var lines = block.split( /(?=\n)/ );

          // We have to grab all lines for a li and call processInline on them
          // once as there are some inline things that can span lines.
          var li_accumulate = "", nl = "";

          // Loop over the lines in this block looking for tight lists.
          tight_search:
          for ( var line_no = 0; line_no < lines.length; line_no++ ) {
            nl = "";
            var l = lines[line_no].replace(/^\n/, function(n) { nl = n; return ""; });


            // TODO: really should cache this
            var line_re = regex_for_depth( stack.length );

            m = l.match( line_re );
            //print( "line:", uneval(l), "\nline match:", uneval(m) );

            // We have a list item
            if ( m[1] !== undefined ) {
              // Process the previous list item, if any
              if ( li_accumulate.length ) {
                add( last_li, loose, this.processInline( li_accumulate ), nl );
                // Loose mode will have been dealt with. Reset it
                loose = false;
                li_accumulate = "";
              }

              m[1] = expand_tab( m[1] );
              var wanted_depth = Math.floor(m[1].length/4)+1;
              //print( "want:", wanted_depth, "stack:", stack.length);
              if ( wanted_depth > stack.length ) {
                // Deep enough for a nested list outright
                //print ( "new nested list" );
                list = make_list( m );
                last_li.push( list );
                last_li = list[1] = [ "listitem" ];
              }
              else {
                // We aren't deep enough to be strictly a new level. This is
                // where Md.pl goes nuts. If the indent matches a level in the
                // stack, put it there, else put it one deeper then the
                // wanted_depth deserves.
                var found = false;
                for ( i = 0; i < stack.length; i++ ) {
                  if ( stack[ i ].indent !== m[1] )
                    continue;

                  list = stack[ i ].list;
                  stack.splice( i+1, stack.length - (i+1) );
                  found = true;
                  break;
                }

                if (!found) {
                  //print("not found. l:", uneval(l));
                  wanted_depth++;
                  if ( wanted_depth <= stack.length ) {
                    stack.splice(wanted_depth, stack.length - wanted_depth);
                    //print("Desired depth now", wanted_depth, "stack:", stack.length);
                    list = stack[wanted_depth-1].list;
                    //print("list:", uneval(list) );
                  }
                  else {
                    //print ("made new stack for messy indent");
                    list = make_list(m);
                    last_li.push(list);
                  }
                }

                //print( uneval(list), "last", list === stack[stack.length-1].list );
                last_li = [ "listitem" ];
                list.push(last_li);
              } // end depth of shenegains
              nl = "";
            }

            // Add content
            if ( l.length > m[0].length )
              li_accumulate += nl + l.substr( m[0].length );
          } // tight_search

          if ( li_accumulate.length ) {
            add( last_li, loose, this.processInline( li_accumulate ), nl );
            // Loose mode will have been dealt with. Reset it
            loose = false;
            li_accumulate = "";
          }

          // Look at the next block - we might have a loose list. Or an extra
          // paragraph for the current li
          var contained = get_contained_blocks( stack.length, next );

          // Deal with code blocks or properly nested lists
          if ( contained.length > 0 ) {
            // Make sure all listitems up the stack are paragraphs
            forEach( stack, paragraphify, this);

            last_li.push.apply( last_li, this.toTree( contained, [] ) );
          }

          var next_block = next[0] && next[0].valueOf() || "";

          if ( next_block.match(is_list_re) || next_block.match( /^ / ) ) {
            block = next.shift();

            // Check for an HR following a list: features/lists/hr_abutting
            var hr = this.dialect.block.horizRule( block, next );

            if ( hr ) {
              ret.push.apply(ret, hr);
              break;
            }

            // Make sure all listitems up the stack are paragraphs
            forEach( stack, paragraphify, this);

            loose = true;
            continue loose_search;
          }
          break;
        } // loose_search

        return ret;
      };
    })(),

    blockquote: function blockquote( block, next ) {
      if ( !block.match( /^>/m ) )
        return undefined;

      var jsonml = [];

      // separate out the leading abutting block, if any. I.e. in this case:
      //
      //  a
      //  > b
      //
      if ( block[ 0 ] !== ">" ) {
        var lines = block.split( /\n/ ),
            prev = [],
            line_no = block.lineNumber;

        // keep shifting lines until you find a crotchet
        while ( lines.length && lines[ 0 ][ 0 ] !== ">" ) {
          prev.push( lines.shift() );
          line_no++;
        }

        var abutting = mk_block( prev.join( "\n" ), "\n", block.lineNumber );
        jsonml.push.apply( jsonml, this.processBlock( abutting, [] ) );
        // reassemble new block of just block quotes!
        block = mk_block( lines.join( "\n" ), block.trailing, line_no );
      }


      // if the next block is also a blockquote merge it in
      while ( next.length && next[ 0 ][ 0 ] === ">" ) {
        var b = next.shift();
        block = mk_block( block + block.trailing + b, b.trailing, block.lineNumber );
      }

      // Strip off the leading "> " and re-process as a block.
      var input = block.replace( /^> ?/gm, "" ),
          old_tree = this.tree,
          processedBlock = this.toTree( input, [ "blockquote" ] ),
          attr = extract_attr( processedBlock );

      // If any link references were found get rid of them
      if ( attr && attr.references ) {
        delete attr.references;
        // And then remove the attribute object if it's empty
        if ( isEmpty( attr ) )
          processedBlock.splice( 1, 1 );
      }

      jsonml.push( processedBlock );
      return jsonml;
    },

    referenceDefn: function referenceDefn( block, next) {
      var re = /^\s*\[(.*?)\]:\s*(\S+)(?:\s+(?:(['"])(.*?)\3|\((.*?)\)))?\n?/;
      // interesting matches are [ , ref_id, url, , title, title ]

      if ( !block.match(re) )
        return undefined;

      // make an attribute node if it doesn't exist
      if ( !extract_attr( this.tree ) )
        this.tree.splice( 1, 0, {} );

      var attrs = extract_attr( this.tree );

      // make a references hash if it doesn't exist
      if ( attrs.references === undefined )
        attrs.references = {};

      var b = this.loop_re_over_block(re, block, function( m ) {

        if ( m[2] && m[2][0] === "<" && m[2][m[2].length-1] === ">" )
          m[2] = m[2].substring( 1, m[2].length - 1 );

        var ref = attrs.references[ m[1].toLowerCase() ] = {
          href: m[2]
        };

        if ( m[4] !== undefined )
          ref.title = m[4];
        else if ( m[5] !== undefined )
          ref.title = m[5];

      } );

      if ( b.length )
        next.unshift( mk_block( b, block.trailing ) );

      return [];
    },

    para: function para( block ) {
      // everything's a para!
      return [ ["para"].concat( this.processInline( block ) ) ];
    }
  }
};

Markdown.dialects.Gruber.inline = {

    __oneElement__: function oneElement( text, patterns_or_re, previous_nodes ) {
      var m,
          res;

      patterns_or_re = patterns_or_re || this.dialect.inline.__patterns__;
      var re = new RegExp( "([\\s\\S]*?)(" + (patterns_or_re.source || patterns_or_re) + ")" );

      m = re.exec( text );
      if (!m) {
        // Just boring text
        return [ text.length, text ];
      }
      else if ( m[1] ) {
        // Some un-interesting text matched. Return that first
        return [ m[1].length, m[1] ];
      }

      var res;
      if ( m[2] in this.dialect.inline ) {
        res = this.dialect.inline[ m[2] ].call(
                  this,
                  text.substr( m.index ), m, previous_nodes || [] );
      }
      // Default for now to make dev easier. just slurp special and output it.
      res = res || [ m[2].length, m[2] ];
      return res;
    },

    __call__: function inline( text, patterns ) {

      var out = [],
          res;

      function add(x) {
        //D:self.debug("  adding output", uneval(x));
        if ( typeof x === "string" && typeof out[out.length-1] === "string" )
          out[ out.length-1 ] += x;
        else
          out.push(x);
      }

      while ( text.length > 0 ) {
        res = this.dialect.inline.__oneElement__.call(this, text, patterns, out );
        text = text.substr( res.shift() );
        forEach(res, add );
      }

      return out;
    },

    // These characters are intersting elsewhere, so have rules for them so that
    // chunks of plain text blocks don't include them
    "]": function () {},
    "}": function () {},

    __escape__ : /^\\[\\`\*_{}\[\]()#\+.!\-]/,

    "\\": function escaped( text ) {
      // [ length of input processed, node/children to add... ]
      // Only esacape: \ ` * _ { } [ ] ( ) # * + - . !
      if ( this.dialect.inline.__escape__.exec( text ) )
        return [ 2, text.charAt( 1 ) ];
      else
        // Not an esacpe
        return [ 1, "\\" ];
    },

    "![": function image( text ) {

      // Unlike images, alt text is plain text only. no other elements are
      // allowed in there

      // ![Alt text](/path/to/img.jpg "Optional title")
      //      1          2            3       4         <--- captures
      var m = text.match( /^!\[(.*?)\][ \t]*\([ \t]*([^")]*?)(?:[ \t]+(["'])(.*?)\3)?[ \t]*\)/ );

      if ( m ) {
        if ( m[2] && m[2][0] === "<" && m[2][m[2].length-1] === ">" )
          m[2] = m[2].substring( 1, m[2].length - 1 );

        m[2] = this.dialect.inline.__call__.call( this, m[2], /\\/ )[0];

        var attrs = { alt: m[1], href: m[2] || "" };
        if ( m[4] !== undefined)
          attrs.title = m[4];

        return [ m[0].length, [ "img", attrs ] ];
      }

      // ![Alt text][id]
      m = text.match( /^!\[(.*?)\][ \t]*\[(.*?)\]/ );

      if ( m ) {
        // We can't check if the reference is known here as it likely wont be
        // found till after. Check it in md tree->hmtl tree conversion
        return [ m[0].length, [ "img_ref", { alt: m[1], ref: m[2].toLowerCase(), original: m[0] } ] ];
      }

      // Just consume the '!['
      return [ 2, "![" ];
    },

    "[": function link( text ) {

      var orig = String(text);
      // Inline content is possible inside `link text`
      var res = Markdown.DialectHelpers.inline_until_char.call( this, text.substr(1), "]" );

      // No closing ']' found. Just consume the [
      if ( !res )
        return [ 1, "[" ];

      var consumed = 1 + res[ 0 ],
          children = res[ 1 ],
          link,
          attrs;

      // At this point the first [...] has been parsed. See what follows to find
      // out which kind of link we are (reference or direct url)
      text = text.substr( consumed );

      // [link text](/path/to/img.jpg "Optional title")
      //                 1            2       3         <--- captures
      // This will capture up to the last paren in the block. We then pull
      // back based on if there a matching ones in the url
      //    ([here](/url/(test))
      // The parens have to be balanced
      var m = text.match( /^\s*\([ \t]*([^"']*)(?:[ \t]+(["'])(.*?)\2)?[ \t]*\)/ );
      if ( m ) {
        var url = m[1];
        consumed += m[0].length;

        if ( url && url[0] === "<" && url[url.length-1] === ">" )
          url = url.substring( 1, url.length - 1 );

        // If there is a title we don't have to worry about parens in the url
        if ( !m[3] ) {
          var open_parens = 1; // One open that isn't in the capture
          for ( var len = 0; len < url.length; len++ ) {
            switch ( url[len] ) {
            case "(":
              open_parens++;
              break;
            case ")":
              if ( --open_parens === 0) {
                consumed -= url.length - len;
                url = url.substring(0, len);
              }
              break;
            }
          }
        }

        // Process escapes only
        url = this.dialect.inline.__call__.call( this, url, /\\/ )[0];

        attrs = { href: url || "" };
        if ( m[3] !== undefined)
          attrs.title = m[3];

        link = [ "link", attrs ].concat( children );
        return [ consumed, link ];
      }

      // [Alt text][id]
      // [Alt text] [id]
      m = text.match( /^\s*\[(.*?)\]/ );

      if ( m ) {

        consumed += m[ 0 ].length;

        // [links][] uses links as its reference
        attrs = { ref: ( m[ 1 ] || String(children) ).toLowerCase(),  original: orig.substr( 0, consumed ) };

        link = [ "link_ref", attrs ].concat( children );

        // We can't check if the reference is known here as it likely wont be
        // found till after. Check it in md tree->hmtl tree conversion.
        // Store the original so that conversion can revert if the ref isn't found.
        return [ consumed, link ];
      }

      // [id]
      // Only if id is plain (no formatting.)
      if ( children.length === 1 && typeof children[0] === "string" ) {

        attrs = { ref: children[0].toLowerCase(),  original: orig.substr( 0, consumed ) };
        link = [ "link_ref", attrs, children[0] ];
        return [ consumed, link ];
      }

      // Just consume the "["
      return [ 1, "[" ];
    },


    "<": function autoLink( text ) {
      var m;

      if ( ( m = text.match( /^<(?:((https?|ftp|mailto):[^>]+)|(.*?@.*?\.[a-zA-Z]+))>/ ) ) !== null ) {
        if ( m[3] )
          return [ m[0].length, [ "link", { href: "mailto:" + m[3] }, m[3] ] ];
        else if ( m[2] === "mailto" )
          return [ m[0].length, [ "link", { href: m[1] }, m[1].substr("mailto:".length ) ] ];
        else
          return [ m[0].length, [ "link", { href: m[1] }, m[1] ] ];
      }

      return [ 1, "<" ];
    },

    "`": function inlineCode( text ) {
      // Inline code block. as many backticks as you like to start it
      // Always skip over the opening ticks.
      var m = text.match( /(`+)(([\s\S]*?)\1)/ );

      if ( m && m[2] )
        return [ m[1].length + m[2].length, [ "inlinecode", m[3] ] ];
      else {
        // TODO: No matching end code found - warn!
        return [ 1, "`" ];
      }
    },

    "  \n": function lineBreak() {
      return [ 3, [ "linebreak" ] ];
    }

};

// Meta Helper/generator method for em and strong handling
function strong_em( tag, md ) {

  var state_slot = tag + "_state",
      other_slot = tag === "strong" ? "em_state" : "strong_state";

  function CloseTag(len) {
    this.len_after = len;
    this.name = "close_" + md;
  }

  return function ( text ) {

    if ( this[state_slot][0] === md ) {
      // Most recent em is of this type
      //D:this.debug("closing", md);
      this[state_slot].shift();

      // "Consume" everything to go back to the recrusion in the else-block below
      return[ text.length, new CloseTag(text.length-md.length) ];
    }
    else {
      // Store a clone of the em/strong states
      var other = this[other_slot].slice(),
          state = this[state_slot].slice();

      this[state_slot].unshift(md);

      //D:this.debug_indent += "  ";

      // Recurse
      var res = this.processInline( text.substr( md.length ) );
      //D:this.debug_indent = this.debug_indent.substr(2);

      var last = res[res.length - 1];

      //D:this.debug("processInline from", tag + ": ", uneval( res ) );

      var check = this[state_slot].shift();
      if ( last instanceof CloseTag ) {
        res.pop();
        // We matched! Huzzah.
        var consumed = text.length - last.len_after;
        return [ consumed, [ tag ].concat(res) ];
      }
      else {
        // Restore the state of the other kind. We might have mistakenly closed it.
        this[other_slot] = other;
        this[state_slot] = state;

        // We can't reuse the processed result as it could have wrong parsing contexts in it.
        return [ md.length, md ];
      }
    }
  }; // End returned function
}

Markdown.dialects.Gruber.inline["**"] = strong_em("strong", "**");
Markdown.dialects.Gruber.inline["__"] = strong_em("strong", "__");
Markdown.dialects.Gruber.inline["*"]  = strong_em("em", "*");
Markdown.dialects.Gruber.inline["_"]  = strong_em("em", "_");


// Build default order from insertion order.
Markdown.buildBlockOrder = function(d) {
  var ord = [];
  for ( var i in d ) {
    if ( i === "__order__" || i === "__call__" )
      continue;
    ord.push( i );
  }
  d.__order__ = ord;
};

// Build patterns for inline matcher
Markdown.buildInlinePatterns = function(d) {
  var patterns = [];

  for ( var i in d ) {
    // __foo__ is reserved and not a pattern
    if ( i.match( /^__.*__$/) )
      continue;
    var l = i.replace( /([\\.*+?|()\[\]{}])/g, "\\$1" )
             .replace( /\n/, "\\n" );
    patterns.push( i.length === 1 ? l : "(?:" + l + ")" );
  }

  patterns = patterns.join("|");
  d.__patterns__ = patterns;
  //print("patterns:", uneval( patterns ) );

  var fn = d.__call__;
  d.__call__ = function(text, pattern) {
    if ( pattern !== undefined )
      return fn.call(this, text, pattern);
    else
      return fn.call(this, text, patterns);
  };
};

Markdown.DialectHelpers = {};
Markdown.DialectHelpers.inline_until_char = function( text, want ) {
  var consumed = 0,
      nodes = [];

  while ( true ) {
    if ( text.charAt( consumed ) === want ) {
      // Found the character we were looking for
      consumed++;
      return [ consumed, nodes ];
    }

    if ( consumed >= text.length ) {
      // No closing char found. Abort.
      return null;
    }

    var res = this.dialect.inline.__oneElement__.call(this, text.substr( consumed ) );
    consumed += res[ 0 ];
    // Add any returned nodes.
    nodes.push.apply( nodes, res.slice( 1 ) );
  }
};

// Helper function to make sub-classing a dialect easier
Markdown.subclassDialect = function( d ) {
  function Block() {}
  Block.prototype = d.block;
  function Inline() {}
  Inline.prototype = d.inline;

  return { block: new Block(), inline: new Inline() };
};

Markdown.buildBlockOrder ( Markdown.dialects.Gruber.block );
Markdown.buildInlinePatterns( Markdown.dialects.Gruber.inline );

Markdown.dialects.Maruku = Markdown.subclassDialect( Markdown.dialects.Gruber );

Markdown.dialects.Maruku.processMetaHash = function processMetaHash( meta_string ) {
  var meta = split_meta_hash( meta_string ),
      attr = {};

  for ( var i = 0; i < meta.length; ++i ) {
    // id: #foo
    if ( /^#/.test( meta[ i ] ) )
      attr.id = meta[ i ].substring( 1 );
    // class: .foo
    else if ( /^\./.test( meta[ i ] ) ) {
      // if class already exists, append the new one
      if ( attr["class"] )
        attr["class"] = attr["class"] + meta[ i ].replace( /./, " " );
      else
        attr["class"] = meta[ i ].substring( 1 );
    }
    // attribute: foo=bar
    else if ( /\=/.test( meta[ i ] ) ) {
      var s = meta[ i ].split( /\=/ );
      attr[ s[ 0 ] ] = s[ 1 ];
    }
  }

  return attr;
};

function split_meta_hash( meta_string ) {
  var meta = meta_string.split( "" ),
      parts = [ "" ],
      in_quotes = false;

  while ( meta.length ) {
    var letter = meta.shift();
    switch ( letter ) {
      case " " :
        // if we're in a quoted section, keep it
        if ( in_quotes )
          parts[ parts.length - 1 ] += letter;
        // otherwise make a new part
        else
          parts.push( "" );
        break;
      case "'" :
      case '"' :
        // reverse the quotes and move straight on
        in_quotes = !in_quotes;
        break;
      case "\\" :
        // shift off the next letter to be used straight away.
        // it was escaped so we'll keep it whatever it is
        letter = meta.shift();
        /* falls through */
      default :
        parts[ parts.length - 1 ] += letter;
        break;
    }
  }

  return parts;
}

Markdown.dialects.Maruku.block.document_meta = function document_meta( block ) {
  // we're only interested in the first block
  if ( block.lineNumber > 1 )
    return undefined;

  // document_meta blocks consist of one or more lines of `Key: Value\n`
  if ( ! block.match( /^(?:\w+:.*\n)*\w+:.*$/ ) )
    return undefined;

  // make an attribute node if it doesn't exist
  if ( !extract_attr( this.tree ) )
    this.tree.splice( 1, 0, {} );

  var pairs = block.split( /\n/ );
  for ( var p in pairs ) {
    var m = pairs[ p ].match( /(\w+):\s*(.*)$/ ),
        key = m[ 1 ].toLowerCase(),
        value = m[ 2 ];

    this.tree[ 1 ][ key ] = value;
  }

  // document_meta produces no content!
  return [];
};

Markdown.dialects.Maruku.block.block_meta = function block_meta( block ) {
  // check if the last line of the block is an meta hash
  var m = block.match( /(^|\n) {0,3}\{:\s*((?:\\\}|[^\}])*)\s*\}$/ );
  if ( !m )
    return undefined;

  // process the meta hash
  var attr = this.dialect.processMetaHash( m[ 2 ] ),
      hash;

  // if we matched ^ then we need to apply meta to the previous block
  if ( m[ 1 ] === "" ) {
    var node = this.tree[ this.tree.length - 1 ];
    hash = extract_attr( node );

    // if the node is a string (rather than JsonML), bail
    if ( typeof node === "string" )
      return undefined;

    // create the attribute hash if it doesn't exist
    if ( !hash ) {
      hash = {};
      node.splice( 1, 0, hash );
    }

    // add the attributes in
    for ( var a in attr )
      hash[ a ] = attr[ a ];

    // return nothing so the meta hash is removed
    return [];
  }

  // pull the meta hash off the block and process what's left
  var b = block.replace( /\n.*$/, "" ),
      result = this.processBlock( b, [] );

  // get or make the attributes hash
  hash = extract_attr( result[ 0 ] );
  if ( !hash ) {
    hash = {};
    result[ 0 ].splice( 1, 0, hash );
  }

  // attach the attributes to the block
  for ( var a in attr )
    hash[ a ] = attr[ a ];

  return result;
};

Markdown.dialects.Maruku.block.definition_list = function definition_list( block, next ) {
  // one or more terms followed by one or more definitions, in a single block
  var tight = /^((?:[^\s:].*\n)+):\s+([\s\S]+)$/,
      list = [ "dl" ],
      i, m;

  // see if we're dealing with a tight or loose block
  if ( ( m = block.match( tight ) ) ) {
    // pull subsequent tight DL blocks out of `next`
    var blocks = [ block ];
    while ( next.length && tight.exec( next[ 0 ] ) )
      blocks.push( next.shift() );

    for ( var b = 0; b < blocks.length; ++b ) {
      var m = blocks[ b ].match( tight ),
          terms = m[ 1 ].replace( /\n$/, "" ).split( /\n/ ),
          defns = m[ 2 ].split( /\n:\s+/ );

      // print( uneval( m ) );

      for ( i = 0; i < terms.length; ++i )
        list.push( [ "dt", terms[ i ] ] );

      for ( i = 0; i < defns.length; ++i ) {
        // run inline processing over the definition
        list.push( [ "dd" ].concat( this.processInline( defns[ i ].replace( /(\n)\s+/, "$1" ) ) ) );
      }
    }
  }
  else {
    return undefined;
  }

  return [ list ];
};

// splits on unescaped instances of @ch. If @ch is not a character the result
// can be unpredictable

Markdown.dialects.Maruku.block.table = function table ( block ) {

  var _split_on_unescaped = function( s, ch ) {
    ch = ch || '\\s';
    if ( ch.match(/^[\\|\[\]{}?*.+^$]$/) )
      ch = '\\' + ch;
    var res = [ ],
        r = new RegExp('^((?:\\\\.|[^\\\\' + ch + '])*)' + ch + '(.*)'),
        m;
    while ( ( m = s.match( r ) ) ) {
      res.push( m[1] );
      s = m[2];
    }
    res.push(s);
    return res;
  };

  var leading_pipe = /^ {0,3}\|(.+)\n {0,3}\|\s*([\-:]+[\-| :]*)\n((?:\s*\|.*(?:\n|$))*)(?=\n|$)/,
      // find at least an unescaped pipe in each line
      no_leading_pipe = /^ {0,3}(\S(?:\\.|[^\\|])*\|.*)\n {0,3}([\-:]+\s*\|[\-| :]*)\n((?:(?:\\.|[^\\|])*\|.*(?:\n|$))*)(?=\n|$)/,
      i,
      m;
  if ( ( m = block.match( leading_pipe ) ) ) {
    // remove leading pipes in contents
    // (header and horizontal rule already have the leading pipe left out)
    m[3] = m[3].replace(/^\s*\|/gm, '');
  } else if ( ! ( m = block.match( no_leading_pipe ) ) ) {
    return undefined;
  }

  var table = [ "table", [ "thead", [ "tr" ] ], [ "tbody" ] ];

  // remove trailing pipes, then split on pipes
  // (no escaped pipes are allowed in horizontal rule)
  m[2] = m[2].replace(/\|\s*$/, '').split('|');

  // process alignment
  var html_attrs = [ ];
  forEach (m[2], function (s) {
    if (s.match(/^\s*-+:\s*$/))
      html_attrs.push({align: "right"});
    else if (s.match(/^\s*:-+\s*$/))
      html_attrs.push({align: "left"});
    else if (s.match(/^\s*:-+:\s*$/))
      html_attrs.push({align: "center"});
    else
      html_attrs.push({});
  });

  // now for the header, avoid escaped pipes
  m[1] = _split_on_unescaped(m[1].replace(/\|\s*$/, ''), '|');
  for (i = 0; i < m[1].length; i++) {
    table[1][1].push(['th', html_attrs[i] || {}].concat(
      this.processInline(m[1][i].trim())));
  }

  // now for body contents
  forEach (m[3].replace(/\|\s*$/mg, '').split('\n'), function (row) {
    var html_row = ['tr'];
    row = _split_on_unescaped(row, '|');
    for (i = 0; i < row.length; i++)
      html_row.push(['td', html_attrs[i] || {}].concat(this.processInline(row[i].trim())));
    table[2].push(html_row);
  }, this);

  return [table];
};

Markdown.dialects.Maruku.inline[ "{:" ] = function inline_meta( text, matches, out ) {
  if ( !out.length )
    return [ 2, "{:" ];

  // get the preceeding element
  var before = out[ out.length - 1 ];

  if ( typeof before === "string" )
    return [ 2, "{:" ];

  // match a meta hash
  var m = text.match( /^\{:\s*((?:\\\}|[^\}])*)\s*\}/ );

  // no match, false alarm
  if ( !m )
    return [ 2, "{:" ];

  // attach the attributes to the preceeding element
  var meta = this.dialect.processMetaHash( m[ 1 ] ),
      attr = extract_attr( before );

  if ( !attr ) {
    attr = {};
    before.splice( 1, 0, attr );
  }

  for ( var k in meta )
    attr[ k ] = meta[ k ];

  // cut out the string and replace it with nothing
  return [ m[ 0 ].length, "" ];
};

Markdown.dialects.Maruku.inline.__escape__ = /^\\[\\`\*_{}\[\]()#\+.!\-|:]/;

Markdown.buildBlockOrder ( Markdown.dialects.Maruku.block );
Markdown.buildInlinePatterns( Markdown.dialects.Maruku.inline );

var isArray = Array.isArray || function(obj) {
  return Object.prototype.toString.call(obj) === "[object Array]";
};

var forEach;
// Don't mess with Array.prototype. Its not friendly
if ( Array.prototype.forEach ) {
  forEach = function( arr, cb, thisp ) {
    return arr.forEach( cb, thisp );
  };
}
else {
  forEach = function(arr, cb, thisp) {
    for (var i = 0; i < arr.length; i++)
      cb.call(thisp || arr, arr[i], i, arr);
  };
}

var isEmpty = function( obj ) {
  for ( var key in obj ) {
    if ( hasOwnProperty.call( obj, key ) )
      return false;
  }

  return true;
};

function extract_attr( jsonml ) {
  return isArray(jsonml)
      && jsonml.length > 1
      && typeof jsonml[ 1 ] === "object"
      && !( isArray(jsonml[ 1 ]) )
      ? jsonml[ 1 ]
      : undefined;
}



/**
 *  renderJsonML( jsonml[, options] ) -> String
 *  - jsonml (Array): JsonML array to render to XML
 *  - options (Object): options
 *
 *  Converts the given JsonML into well-formed XML.
 *
 *  The options currently understood are:
 *
 *  - root (Boolean): wether or not the root node should be included in the
 *    output, or just its children. The default `false` is to not include the
 *    root itself.
 */
expose.renderJsonML = function( jsonml, options ) {
  options = options || {};
  // include the root element in the rendered output?
  options.root = options.root || false;

  var content = [];

  if ( options.root ) {
    content.push( render_tree( jsonml ) );
  }
  else {
    jsonml.shift(); // get rid of the tag
    if ( jsonml.length && typeof jsonml[ 0 ] === "object" && !( jsonml[ 0 ] instanceof Array ) )
      jsonml.shift(); // get rid of the attributes

    while ( jsonml.length )
      content.push( render_tree( jsonml.shift() ) );
  }

  return content.join( "\n\n" );
};

function escapeHTML( text ) {
  return text; // andre was here
  return text.replace( /&/g, "&amp;" )
             .replace( /</g, "&lt;" )
             .replace( />/g, "&gt;" )
             .replace( /"/g, "&quot;" )
             .replace( /'/g, "&#39;" );
}

function render_tree( jsonml ) {
  // basic case
  if ( typeof jsonml === "string" )
    return escapeHTML( jsonml );

  var tag = jsonml.shift(),
      attributes = {},
      content = [];

  if ( jsonml.length && typeof jsonml[ 0 ] === "object" && !( jsonml[ 0 ] instanceof Array ) )
    attributes = jsonml.shift();

  while ( jsonml.length )
    content.push( render_tree( jsonml.shift() ) );

  var tag_attrs = "";
  for ( var a in attributes )
    tag_attrs += " " + a + '="' + escapeHTML( attributes[ a ] ) + '"';

  // be careful about adding whitespace here for inline elements
  if ( tag === "img" || tag === "br" || tag === "hr" )
    return "<"+ tag + tag_attrs + "/>";
  else
    return "<"+ tag + tag_attrs + ">" + content.join( "" ) + "</" + tag + ">";
}

function convert_tree_to_html( tree, references, options ) {
  var i;
  options = options || {};

  // shallow clone
  var jsonml = tree.slice( 0 );

  if ( typeof options.preprocessTreeNode === "function" )
    jsonml = options.preprocessTreeNode(jsonml, references);

  // Clone attributes if they exist
  var attrs = extract_attr( jsonml );
  if ( attrs ) {
    jsonml[ 1 ] = {};
    for ( i in attrs ) {
      jsonml[ 1 ][ i ] = attrs[ i ];
    }
    attrs = jsonml[ 1 ];
  }

  // basic case
  if ( typeof jsonml === "string" )
    return jsonml;

  // convert this node
  switch ( jsonml[ 0 ] ) {
    case "header":
      jsonml[ 0 ] = "h" + jsonml[ 1 ].level;
      delete jsonml[ 1 ].level;
      break;
    case "bulletlist":
      jsonml[ 0 ] = "ul";
      break;
    case "numberlist":
      jsonml[ 0 ] = "ol";
      break;
    case "listitem":
      jsonml[ 0 ] = "li";
      break;
    case "para":
      jsonml[ 0 ] = "p";
      break;
    case "markdown":
      jsonml[ 0 ] = "html";
      if ( attrs )
        delete attrs.references;
      break;
    case "code_block":
      jsonml[ 0 ] = "pre";
      i = attrs ? 2 : 1;
      var code = [ "code" ];
      code.push.apply( code, jsonml.splice( i, jsonml.length - i ) );
      jsonml[ i ] = code;
      break;
    case "inlinecode":
      jsonml[ 0 ] = "code";
      break;
    case "img":
      jsonml[ 1 ].src = jsonml[ 1 ].href;
      delete jsonml[ 1 ].href;
      break;
    case "linebreak":
      jsonml[ 0 ] = "br";
    break;
    case "link":
      jsonml[ 0 ] = "a";
      break;
    case "link_ref":
      jsonml[ 0 ] = "a";

      // grab this ref and clean up the attribute node
      var ref = references[ attrs.ref ];

      // if the reference exists, make the link
      if ( ref ) {
        delete attrs.ref;

        // add in the href and title, if present
        attrs.href = ref.href;
        if ( ref.title )
          attrs.title = ref.title;

        // get rid of the unneeded original text
        delete attrs.original;
      }
      // the reference doesn't exist, so revert to plain text
      else {
        return attrs.original;
      }
      break;
    case "img_ref":
      jsonml[ 0 ] = "img";

      // grab this ref and clean up the attribute node
      var ref = references[ attrs.ref ];

      // if the reference exists, make the link
      if ( ref ) {
        delete attrs.ref;

        // add in the href and title, if present
        attrs.src = ref.href;
        if ( ref.title )
          attrs.title = ref.title;

        // get rid of the unneeded original text
        delete attrs.original;
      }
      // the reference doesn't exist, so revert to plain text
      else {
        return attrs.original;
      }
      break;
  }

  // convert all the children
  i = 1;

  // deal with the attribute node, if it exists
  if ( attrs ) {
    // if there are keys, skip over it
    for ( var key in jsonml[ 1 ] ) {
      i = 2;
      break;
    }
    // if there aren't, remove it
    if ( i === 1 )
      jsonml.splice( i, 1 );
  }

  for ( ; i < jsonml.length; ++i ) {
    jsonml[ i ] = convert_tree_to_html( jsonml[ i ], references, options );
  }

  return jsonml;
}


// merges adjacent text nodes into a single node
function merge_text_nodes( jsonml ) {
  // skip the tag name and attribute hash
  var i = extract_attr( jsonml ) ? 2 : 1;

  while ( i < jsonml.length ) {
    // if it's a string check the next item too
    if ( typeof jsonml[ i ] === "string" ) {
      if ( i + 1 < jsonml.length && typeof jsonml[ i + 1 ] === "string" ) {
        // merge the second string into the first and remove it
        jsonml[ i ] += jsonml.splice( i + 1, 1 )[ 0 ];
      }
      else {
        ++i;
      }
    }
    // if it's not a string recurse
    else {
      merge_text_nodes( jsonml[ i ] );
      ++i;
    }
  }
}

} )( (function() {
  if ( typeof exports === "undefined" ) {
    window.markdown = {};
    return window.markdown;
  }
  else {
    return exports;
  }
} )() );

// from 'lib/moment+langs.js'
//! moment.js
//! version : 2.2.1
//! authors : Tim Wood, Iskren Chernev, Moment.js contributors
//! license : MIT
//! momentjs.com

(function (undefined) {

    /************************************
        Constants
    ************************************/

    var moment,
        VERSION = "2.2.1",
        round = Math.round, i,
        // internal storage for language config files
        languages = {},

        // check for nodeJS
        hasModule = (typeof module !== 'undefined' && module.exports),

        // ASP.NET json date format regex
        aspNetJsonRegex = /^\/?Date\((\-?\d+)/i,
        aspNetTimeSpanJsonRegex = /(\-)?(?:(\d*)\.)?(\d+)\:(\d+)\:(\d+)\.?(\d{3})?/,

        // format tokens
        formattingTokens = /(\[[^\[]*\])|(\\)?(Mo|MM?M?M?|Do|DDDo|DD?D?D?|ddd?d?|do?|w[o|w]?|W[o|W]?|YYYYY|YYYY|YY|gg(ggg?)?|GG(GGG?)?|e|E|a|A|hh?|HH?|mm?|ss?|SS?S?|X|zz?|ZZ?|.)/g,
        localFormattingTokens = /(\[[^\[]*\])|(\\)?(LT|LL?L?L?|l{1,4})/g,

        // parsing token regexes
        parseTokenOneOrTwoDigits = /\d\d?/, // 0 - 99
        parseTokenOneToThreeDigits = /\d{1,3}/, // 0 - 999
        parseTokenThreeDigits = /\d{3}/, // 000 - 999
        parseTokenFourDigits = /\d{1,4}/, // 0 - 9999
        parseTokenSixDigits = /[+\-]?\d{1,6}/, // -999,999 - 999,999
        parseTokenWord = /[0-9]*['a-z\u00A0-\u05FF\u0700-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]+|[\u0600-\u06FF\/]+(\s*?[\u0600-\u06FF]+){1,2}/i, // any word (or two) characters or numbers including two/three word month in arabic.
        parseTokenTimezone = /Z|[\+\-]\d\d:?\d\d/i, // +00:00 -00:00 +0000 -0000 or Z
        parseTokenT = /T/i, // T (ISO seperator)
        parseTokenTimestampMs = /[\+\-]?\d+(\.\d{1,3})?/, // 123456789 123456789.123

        // preliminary iso regex
        // 0000-00-00 + T + 00 or 00:00 or 00:00:00 or 00:00:00.000 + +00:00 or +0000
        isoRegex = /^\s*\d{4}-\d\d-\d\d((T| )(\d\d(:\d\d(:\d\d(\.\d\d?\d?)?)?)?)?([\+\-]\d\d:?\d\d)?)?/,
        isoFormat = 'YYYY-MM-DDTHH:mm:ssZ',

        // iso time formats and regexes
        isoTimes = [
            ['HH:mm:ss.S', /(T| )\d\d:\d\d:\d\d\.\d{1,3}/],
            ['HH:mm:ss', /(T| )\d\d:\d\d:\d\d/],
            ['HH:mm', /(T| )\d\d:\d\d/],
            ['HH', /(T| )\d\d/]
        ],

        // timezone chunker "+10:00" > ["10", "00"] or "-1530" > ["-15", "30"]
        parseTimezoneChunker = /([\+\-]|\d\d)/gi,

        // getter and setter names
        proxyGettersAndSetters = 'Date|Hours|Minutes|Seconds|Milliseconds'.split('|'),
        unitMillisecondFactors = {
            'Milliseconds' : 1,
            'Seconds' : 1e3,
            'Minutes' : 6e4,
            'Hours' : 36e5,
            'Days' : 864e5,
            'Months' : 2592e6,
            'Years' : 31536e6
        },

        unitAliases = {
            ms : 'millisecond',
            s : 'second',
            m : 'minute',
            h : 'hour',
            d : 'day',
            w : 'week',
            W : 'isoweek',
            M : 'month',
            y : 'year'
        },

        // format function strings
        formatFunctions = {},

        // tokens to ordinalize and pad
        ordinalizeTokens = 'DDD w W M D d'.split(' '),
        paddedTokens = 'M D H h m s w W'.split(' '),

        formatTokenFunctions = {
            M    : function () {
                return this.month() + 1;
            },
            MMM  : function (format) {
                return this.lang().monthsShort(this, format);
            },
            MMMM : function (format) {
                return this.lang().months(this, format);
            },
            D    : function () {
                return this.date();
            },
            DDD  : function () {
                return this.dayOfYear();
            },
            d    : function () {
                return this.day();
            },
            dd   : function (format) {
                return this.lang().weekdaysMin(this, format);
            },
            ddd  : function (format) {
                return this.lang().weekdaysShort(this, format);
            },
            dddd : function (format) {
                return this.lang().weekdays(this, format);
            },
            w    : function () {
                return this.week();
            },
            W    : function () {
                return this.isoWeek();
            },
            YY   : function () {
                return leftZeroFill(this.year() % 100, 2);
            },
            YYYY : function () {
                return leftZeroFill(this.year(), 4);
            },
            YYYYY : function () {
                return leftZeroFill(this.year(), 5);
            },
            gg   : function () {
                return leftZeroFill(this.weekYear() % 100, 2);
            },
            gggg : function () {
                return this.weekYear();
            },
            ggggg : function () {
                return leftZeroFill(this.weekYear(), 5);
            },
            GG   : function () {
                return leftZeroFill(this.isoWeekYear() % 100, 2);
            },
            GGGG : function () {
                return this.isoWeekYear();
            },
            GGGGG : function () {
                return leftZeroFill(this.isoWeekYear(), 5);
            },
            e : function () {
                return this.weekday();
            },
            E : function () {
                return this.isoWeekday();
            },
            a    : function () {
                return this.lang().meridiem(this.hours(), this.minutes(), true);
            },
            A    : function () {
                return this.lang().meridiem(this.hours(), this.minutes(), false);
            },
            H    : function () {
                return this.hours();
            },
            h    : function () {
                return this.hours() % 12 || 12;
            },
            m    : function () {
                return this.minutes();
            },
            s    : function () {
                return this.seconds();
            },
            S    : function () {
                return ~~(this.milliseconds() / 100);
            },
            SS   : function () {
                return leftZeroFill(~~(this.milliseconds() / 10), 2);
            },
            SSS  : function () {
                return leftZeroFill(this.milliseconds(), 3);
            },
            Z    : function () {
                var a = -this.zone(),
                    b = "+";
                if (a < 0) {
                    a = -a;
                    b = "-";
                }
                return b + leftZeroFill(~~(a / 60), 2) + ":" + leftZeroFill(~~a % 60, 2);
            },
            ZZ   : function () {
                var a = -this.zone(),
                    b = "+";
                if (a < 0) {
                    a = -a;
                    b = "-";
                }
                return b + leftZeroFill(~~(10 * a / 6), 4);
            },
            z : function () {
                return this.zoneAbbr();
            },
            zz : function () {
                return this.zoneName();
            },
            X    : function () {
                return this.unix();
            }
        };

    function padToken(func, count) {
        return function (a) {
            return leftZeroFill(func.call(this, a), count);
        };
    }
    function ordinalizeToken(func, period) {
        return function (a) {
            return this.lang().ordinal(func.call(this, a), period);
        };
    }

    while (ordinalizeTokens.length) {
        i = ordinalizeTokens.pop();
        formatTokenFunctions[i + 'o'] = ordinalizeToken(formatTokenFunctions[i], i);
    }
    while (paddedTokens.length) {
        i = paddedTokens.pop();
        formatTokenFunctions[i + i] = padToken(formatTokenFunctions[i], 2);
    }
    formatTokenFunctions.DDDD = padToken(formatTokenFunctions.DDD, 3);


    /************************************
        Constructors
    ************************************/

    function Language() {

    }

    // Moment prototype object
    function Moment(config) {
        extend(this, config);
    }

    // Duration Constructor
    function Duration(duration) {
        var years = duration.years || duration.year || duration.y || 0,
            months = duration.months || duration.month || duration.M || 0,
            weeks = duration.weeks || duration.week || duration.w || 0,
            days = duration.days || duration.day || duration.d || 0,
            hours = duration.hours || duration.hour || duration.h || 0,
            minutes = duration.minutes || duration.minute || duration.m || 0,
            seconds = duration.seconds || duration.second || duration.s || 0,
            milliseconds = duration.milliseconds || duration.millisecond || duration.ms || 0;

        // store reference to input for deterministic cloning
        this._input = duration;

        // representation for dateAddRemove
        this._milliseconds = +milliseconds +
            seconds * 1e3 + // 1000
            minutes * 6e4 + // 1000 * 60
            hours * 36e5; // 1000 * 60 * 60
        // Because of dateAddRemove treats 24 hours as different from a
        // day when working around DST, we need to store them separately
        this._days = +days +
            weeks * 7;
        // It is impossible translate months into days without knowing
        // which months you are are talking about, so we have to store
        // it separately.
        this._months = +months +
            years * 12;

        this._data = {};

        this._bubble();
    }


    /************************************
        Helpers
    ************************************/


    function extend(a, b) {
        for (var i in b) {
            if (b.hasOwnProperty(i)) {
                a[i] = b[i];
            }
        }
        return a;
    }

    function absRound(number) {
        if (number < 0) {
            return Math.ceil(number);
        } else {
            return Math.floor(number);
        }
    }

    // left zero fill a number
    // see http://jsperf.com/left-zero-filling for performance comparison
    function leftZeroFill(number, targetLength) {
        var output = number + '';
        while (output.length < targetLength) {
            output = '0' + output;
        }
        return output;
    }

    // helper function for _.addTime and _.subtractTime
    function addOrSubtractDurationFromMoment(mom, duration, isAdding, ignoreUpdateOffset) {
        var milliseconds = duration._milliseconds,
            days = duration._days,
            months = duration._months,
            minutes,
            hours;

        if (milliseconds) {
            mom._d.setTime(+mom._d + milliseconds * isAdding);
        }
        // store the minutes and hours so we can restore them
        if (days || months) {
            minutes = mom.minute();
            hours = mom.hour();
        }
        if (days) {
            mom.date(mom.date() + days * isAdding);
        }
        if (months) {
            mom.month(mom.month() + months * isAdding);
        }
        if (milliseconds && !ignoreUpdateOffset) {
            moment.updateOffset(mom);
        }
        // restore the minutes and hours after possibly changing dst
        if (days || months) {
            mom.minute(minutes);
            mom.hour(hours);
        }
    }

    // check if is an array
    function isArray(input) {
        return Object.prototype.toString.call(input) === '[object Array]';
    }

    // compare two arrays, return the number of differences
    function compareArrays(array1, array2) {
        var len = Math.min(array1.length, array2.length),
            lengthDiff = Math.abs(array1.length - array2.length),
            diffs = 0,
            i;
        for (i = 0; i < len; i++) {
            if (~~array1[i] !== ~~array2[i]) {
                diffs++;
            }
        }
        return diffs + lengthDiff;
    }

    function normalizeUnits(units) {
        return units ? unitAliases[units] || units.toLowerCase().replace(/(.)s$/, '$1') : units;
    }


    /************************************
        Languages
    ************************************/


    extend(Language.prototype, {

        set : function (config) {
            var prop, i;
            for (i in config) {
                prop = config[i];
                if (typeof prop === 'function') {
                    this[i] = prop;
                } else {
                    this['_' + i] = prop;
                }
            }
        },

        _months : "January_February_March_April_May_June_July_August_September_October_November_December".split("_"),
        months : function (m) {
            return this._months[m.month()];
        },

        _monthsShort : "Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec".split("_"),
        monthsShort : function (m) {
            return this._monthsShort[m.month()];
        },

        monthsParse : function (monthName) {
            var i, mom, regex;

            if (!this._monthsParse) {
                this._monthsParse = [];
            }

            for (i = 0; i < 12; i++) {
                // make the regex if we don't have it already
                if (!this._monthsParse[i]) {
                    mom = moment.utc([2000, i]);
                    regex = '^' + this.months(mom, '') + '|^' + this.monthsShort(mom, '');
                    this._monthsParse[i] = new RegExp(regex.replace('.', ''), 'i');
                }
                // test the regex
                if (this._monthsParse[i].test(monthName)) {
                    return i;
                }
            }
        },

        _weekdays : "Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday".split("_"),
        weekdays : function (m) {
            return this._weekdays[m.day()];
        },

        _weekdaysShort : "Sun_Mon_Tue_Wed_Thu_Fri_Sat".split("_"),
        weekdaysShort : function (m) {
            return this._weekdaysShort[m.day()];
        },

        _weekdaysMin : "Su_Mo_Tu_We_Th_Fr_Sa".split("_"),
        weekdaysMin : function (m) {
            return this._weekdaysMin[m.day()];
        },

        weekdaysParse : function (weekdayName) {
            var i, mom, regex;

            if (!this._weekdaysParse) {
                this._weekdaysParse = [];
            }

            for (i = 0; i < 7; i++) {
                // make the regex if we don't have it already
                if (!this._weekdaysParse[i]) {
                    mom = moment([2000, 1]).day(i);
                    regex = '^' + this.weekdays(mom, '') + '|^' + this.weekdaysShort(mom, '') + '|^' + this.weekdaysMin(mom, '');
                    this._weekdaysParse[i] = new RegExp(regex.replace('.', ''), 'i');
                }
                // test the regex
                if (this._weekdaysParse[i].test(weekdayName)) {
                    return i;
                }
            }
        },

        _longDateFormat : {
            LT : "h:mm A",
            L : "MM/DD/YYYY",
            LL : "MMMM D YYYY",
            LLL : "MMMM D YYYY LT",
            LLLL : "dddd, MMMM D YYYY LT"
        },
        longDateFormat : function (key) {
            var output = this._longDateFormat[key];
            if (!output && this._longDateFormat[key.toUpperCase()]) {
                output = this._longDateFormat[key.toUpperCase()].replace(/MMMM|MM|DD|dddd/g, function (val) {
                    return val.slice(1);
                });
                this._longDateFormat[key] = output;
            }
            return output;
        },

        isPM : function (input) {
            // IE8 Quirks Mode & IE7 Standards Mode do not allow accessing strings like arrays
            // Using charAt should be more compatible.
            return ((input + '').toLowerCase().charAt(0) === 'p');
        },

        _meridiemParse : /[ap]\.?m?\.?/i,
        meridiem : function (hours, minutes, isLower) {
            if (hours > 11) {
                return isLower ? 'pm' : 'PM';
            } else {
                return isLower ? 'am' : 'AM';
            }
        },

        _calendar : {
            sameDay : '[Today at] LT',
            nextDay : '[Tomorrow at] LT',
            nextWeek : 'dddd [at] LT',
            lastDay : '[Yesterday at] LT',
            lastWeek : '[Last] dddd [at] LT',
            sameElse : 'L'
        },
        calendar : function (key, mom) {
            var output = this._calendar[key];
            return typeof output === 'function' ? output.apply(mom) : output;
        },

        _relativeTime : {
            future : "in %s",
            past : "%s ago",
            s : "a few seconds",
            m : "a minute",
            mm : "%d minutes",
            h : "an hour",
            hh : "%d hours",
            d : "a day",
            dd : "%d days",
            M : "a month",
            MM : "%d months",
            y : "a year",
            yy : "%d years"
        },
        relativeTime : function (number, withoutSuffix, string, isFuture) {
            var output = this._relativeTime[string];
            return (typeof output === 'function') ?
                output(number, withoutSuffix, string, isFuture) :
                output.replace(/%d/i, number);
        },
        pastFuture : function (diff, output) {
            var format = this._relativeTime[diff > 0 ? 'future' : 'past'];
            return typeof format === 'function' ? format(output) : format.replace(/%s/i, output);
        },

        ordinal : function (number) {
            return this._ordinal.replace("%d", number);
        },
        _ordinal : "%d",

        preparse : function (string) {
            return string;
        },

        postformat : function (string) {
            return string;
        },

        week : function (mom) {
            return weekOfYear(mom, this._week.dow, this._week.doy).week;
        },
        _week : {
            dow : 0, // Sunday is the first day of the week.
            doy : 6  // The week that contains Jan 1st is the first week of the year.
        }
    });

    // Loads a language definition into the `languages` cache.  The function
    // takes a key and optionally values.  If not in the browser and no values
    // are provided, it will load the language file module.  As a convenience,
    // this function also returns the language values.
    function loadLang(key, values) {
        values.abbr = key;
        if (!languages[key]) {
            languages[key] = new Language();
        }
        languages[key].set(values);
        return languages[key];
    }

    // Remove a language from the `languages` cache. Mostly useful in tests.
    function unloadLang(key) {
        delete languages[key];
    }

    // Determines which language definition to use and returns it.
    //
    // With no parameters, it will return the global language.  If you
    // pass in a language key, such as 'en', it will return the
    // definition for 'en', so long as 'en' has already been loaded using
    // moment.lang.
    function getLangDefinition(key) {
        if (!key) {
            return moment.fn._lang;
        }
        if (!languages[key] && hasModule) {
            try {
                require('./lang/' + key);
            } catch (e) {
                // call with no params to set to default
                return moment.fn._lang;
            }
        }
        return languages[key] || moment.fn._lang;
    }


    /************************************
        Formatting
    ************************************/


    function removeFormattingTokens(input) {
        if (input.match(/\[.*\]/)) {
            return input.replace(/^\[|\]$/g, "");
        }
        return input.replace(/\\/g, "");
    }

    function makeFormatFunction(format) {
        var array = format.match(formattingTokens), i, length;

        for (i = 0, length = array.length; i < length; i++) {
            if (formatTokenFunctions[array[i]]) {
                array[i] = formatTokenFunctions[array[i]];
            } else {
                array[i] = removeFormattingTokens(array[i]);
            }
        }

        return function (mom) {
            var output = "";
            for (i = 0; i < length; i++) {
                output += array[i] instanceof Function ? array[i].call(mom, format) : array[i];
            }
            return output;
        };
    }

    // format date using native date object
    function formatMoment(m, format) {

        format = expandFormat(format, m.lang());

        if (!formatFunctions[format]) {
            formatFunctions[format] = makeFormatFunction(format);
        }

        return formatFunctions[format](m);
    }

    function expandFormat(format, lang) {
        var i = 5;

        function replaceLongDateFormatTokens(input) {
            return lang.longDateFormat(input) || input;
        }

        while (i-- && (localFormattingTokens.lastIndex = 0,
                    localFormattingTokens.test(format))) {
            format = format.replace(localFormattingTokens, replaceLongDateFormatTokens);
        }

        return format;
    }


    /************************************
        Parsing
    ************************************/


    // get the regex to find the next token
    function getParseRegexForToken(token, config) {
        switch (token) {
        case 'DDDD':
            return parseTokenThreeDigits;
        case 'YYYY':
            return parseTokenFourDigits;
        case 'YYYYY':
            return parseTokenSixDigits;
        case 'S':
        case 'SS':
        case 'SSS':
        case 'DDD':
            return parseTokenOneToThreeDigits;
        case 'MMM':
        case 'MMMM':
        case 'dd':
        case 'ddd':
        case 'dddd':
            return parseTokenWord;
        case 'a':
        case 'A':
            return getLangDefinition(config._l)._meridiemParse;
        case 'X':
            return parseTokenTimestampMs;
        case 'Z':
        case 'ZZ':
            return parseTokenTimezone;
        case 'T':
            return parseTokenT;
        case 'MM':
        case 'DD':
        case 'YY':
        case 'HH':
        case 'hh':
        case 'mm':
        case 'ss':
        case 'M':
        case 'D':
        case 'd':
        case 'H':
        case 'h':
        case 'm':
        case 's':
            return parseTokenOneOrTwoDigits;
        default :
            return new RegExp(token.replace('\\', ''));
        }
    }

    function timezoneMinutesFromString(string) {
        var tzchunk = (parseTokenTimezone.exec(string) || [])[0],
            parts = (tzchunk + '').match(parseTimezoneChunker) || ['-', 0, 0],
            minutes = +(parts[1] * 60) + ~~parts[2];

        return parts[0] === '+' ? -minutes : minutes;
    }

    // function to convert string input to date
    function addTimeToArrayFromToken(token, input, config) {
        var a, datePartArray = config._a;

        switch (token) {
        // MONTH
        case 'M' : // fall through to MM
        case 'MM' :
            if (input != null) {
                datePartArray[1] = ~~input - 1;
            }
            break;
        case 'MMM' : // fall through to MMMM
        case 'MMMM' :
            a = getLangDefinition(config._l).monthsParse(input);
            // if we didn't find a month name, mark the date as invalid.
            if (a != null) {
                datePartArray[1] = a;
            } else {
                config._isValid = false;
            }
            break;
        // DAY OF MONTH
        case 'D' : // fall through to DD
        case 'DD' :
            if (input != null) {
                datePartArray[2] = ~~input;
            }
            break;
        // DAY OF YEAR
        case 'DDD' : // fall through to DDDD
        case 'DDDD' :
            if (input != null) {
                datePartArray[1] = 0;
                datePartArray[2] = ~~input;
            }
            break;
        // YEAR
        case 'YY' :
            datePartArray[0] = ~~input + (~~input > 68 ? 1900 : 2000);
            break;
        case 'YYYY' :
        case 'YYYYY' :
            datePartArray[0] = ~~input;
            break;
        // AM / PM
        case 'a' : // fall through to A
        case 'A' :
            config._isPm = getLangDefinition(config._l).isPM(input);
            break;
        // 24 HOUR
        case 'H' : // fall through to hh
        case 'HH' : // fall through to hh
        case 'h' : // fall through to hh
        case 'hh' :
            datePartArray[3] = ~~input;
            break;
        // MINUTE
        case 'm' : // fall through to mm
        case 'mm' :
            datePartArray[4] = ~~input;
            break;
        // SECOND
        case 's' : // fall through to ss
        case 'ss' :
            datePartArray[5] = ~~input;
            break;
        // MILLISECOND
        case 'S' :
        case 'SS' :
        case 'SSS' :
            datePartArray[6] = ~~ (('0.' + input) * 1000);
            break;
        // UNIX TIMESTAMP WITH MS
        case 'X':
            config._d = new Date(parseFloat(input) * 1000);
            break;
        // TIMEZONE
        case 'Z' : // fall through to ZZ
        case 'ZZ' :
            config._useUTC = true;
            config._tzm = timezoneMinutesFromString(input);
            break;
        }

        // if the input is null, the date is not valid
        if (input == null) {
            config._isValid = false;
        }
    }

    // convert an array to a date.
    // the array should mirror the parameters below
    // note: all values past the year are optional and will default to the lowest possible value.
    // [year, month, day , hour, minute, second, millisecond]
    function dateFromArray(config) {
        var i, date, input = [], currentDate;

        if (config._d) {
            return;
        }

        // Default to current date.
        // * if no year, month, day of month are given, default to today
        // * if day of month is given, default month and year
        // * if month is given, default only year
        // * if year is given, don't default anything
        currentDate = currentDateArray(config);
        for (i = 0; i < 3 && config._a[i] == null; ++i) {
            config._a[i] = input[i] = currentDate[i];
        }

        // Zero out whatever was not defaulted, including time
        for (; i < 7; i++) {
            config._a[i] = input[i] = (config._a[i] == null) ? (i === 2 ? 1 : 0) : config._a[i];
        }

        // add the offsets to the time to be parsed so that we can have a clean array for checking isValid
        input[3] += ~~((config._tzm || 0) / 60);
        input[4] += ~~((config._tzm || 0) % 60);

        date = new Date(0);

        if (config._useUTC) {
            date.setUTCFullYear(input[0], input[1], input[2]);
            date.setUTCHours(input[3], input[4], input[5], input[6]);
        } else {
            date.setFullYear(input[0], input[1], input[2]);
            date.setHours(input[3], input[4], input[5], input[6]);
        }

        config._d = date;
    }

    function dateFromObject(config) {
        var o = config._i;

        if (config._d) {
            return;
        }

        config._a = [
            o.years || o.year || o.y,
            o.months || o.month || o.M,
            o.days || o.day || o.d,
            o.hours || o.hour || o.h,
            o.minutes || o.minute || o.m,
            o.seconds || o.second || o.s,
            o.milliseconds || o.millisecond || o.ms
        ];

        dateFromArray(config);
    }

    function currentDateArray(config) {
        var now = new Date();
        if (config._useUTC) {
            return [
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate()
            ];
        } else {
            return [now.getFullYear(), now.getMonth(), now.getDate()];
        }
    }

    // date from string and format string
    function makeDateFromStringAndFormat(config) {
        // This array is used to make a Date, either with `new Date` or `Date.UTC`
        var lang = getLangDefinition(config._l),
            string = '' + config._i,
            i, parsedInput, tokens;

        tokens = expandFormat(config._f, lang).match(formattingTokens);

        config._a = [];

        for (i = 0; i < tokens.length; i++) {
            parsedInput = (getParseRegexForToken(tokens[i], config).exec(string) || [])[0];
            if (parsedInput) {
                string = string.slice(string.indexOf(parsedInput) + parsedInput.length);
            }
            // don't parse if its not a known token
            if (formatTokenFunctions[tokens[i]]) {
                addTimeToArrayFromToken(tokens[i], parsedInput, config);
            }
        }

        // add remaining unparsed input to the string
        if (string) {
            config._il = string;
        }

        // handle am pm
        if (config._isPm && config._a[3] < 12) {
            config._a[3] += 12;
        }
        // if is 12 am, change hours to 0
        if (config._isPm === false && config._a[3] === 12) {
            config._a[3] = 0;
        }
        // return
        dateFromArray(config);
    }

    // date from string and array of format strings
    function makeDateFromStringAndArray(config) {
        var tempConfig,
            tempMoment,
            bestMoment,

            scoreToBeat = 99,
            i,
            currentScore;

        for (i = 0; i < config._f.length; i++) {
            tempConfig = extend({}, config);
            tempConfig._f = config._f[i];
            makeDateFromStringAndFormat(tempConfig);
            tempMoment = new Moment(tempConfig);

            currentScore = compareArrays(tempConfig._a, tempMoment.toArray());

            // if there is any input that was not parsed
            // add a penalty for that format
            if (tempMoment._il) {
                currentScore += tempMoment._il.length;
            }

            if (currentScore < scoreToBeat) {
                scoreToBeat = currentScore;
                bestMoment = tempMoment;
            }
        }

        extend(config, bestMoment);
    }

    // date from iso format
    function makeDateFromString(config) {
        var i,
            string = config._i,
            match = isoRegex.exec(string);

        if (match) {
            // match[2] should be "T" or undefined
            config._f = 'YYYY-MM-DD' + (match[2] || " ");
            for (i = 0; i < 4; i++) {
                if (isoTimes[i][1].exec(string)) {
                    config._f += isoTimes[i][0];
                    break;
                }
            }
            if (parseTokenTimezone.exec(string)) {
                config._f += " Z";
            }
            makeDateFromStringAndFormat(config);
        } else {
            config._d = new Date(string);
        }
    }

    function makeDateFromInput(config) {
        var input = config._i,
            matched = aspNetJsonRegex.exec(input);

        if (input === undefined) {
            config._d = new Date();
        } else if (matched) {
            config._d = new Date(+matched[1]);
        } else if (typeof input === 'string') {
            makeDateFromString(config);
        } else if (isArray(input)) {
            config._a = input.slice(0);
            dateFromArray(config);
        } else if (input instanceof Date) {
            config._d = new Date(+input);
        } else if (typeof(input) === 'object') {
            dateFromObject(config);
        } else {
            config._d = new Date(input);
        }
    }


    /************************************
        Relative Time
    ************************************/


    // helper function for moment.fn.from, moment.fn.fromNow, and moment.duration.fn.humanize
    function substituteTimeAgo(string, number, withoutSuffix, isFuture, lang) {
        return lang.relativeTime(number || 1, !!withoutSuffix, string, isFuture);
    }

    function relativeTime(milliseconds, withoutSuffix, lang) {
        var seconds = round(Math.abs(milliseconds) / 1000),
            minutes = round(seconds / 60),
            hours = round(minutes / 60),
            days = round(hours / 24),
            years = round(days / 365),
            args = seconds < 45 && ['s', seconds] ||
                minutes === 1 && ['m'] ||
                minutes < 45 && ['mm', minutes] ||
                hours === 1 && ['h'] ||
                hours < 22 && ['hh', hours] ||
                days === 1 && ['d'] ||
                days <= 25 && ['dd', days] ||
                days <= 45 && ['M'] ||
                days < 345 && ['MM', round(days / 30)] ||
                years === 1 && ['y'] || ['yy', years];
        args[2] = withoutSuffix;
        args[3] = milliseconds > 0;
        args[4] = lang;
        return substituteTimeAgo.apply({}, args);
    }


    /************************************
        Week of Year
    ************************************/


    // firstDayOfWeek       0 = sun, 6 = sat
    //                      the day of the week that starts the week
    //                      (usually sunday or monday)
    // firstDayOfWeekOfYear 0 = sun, 6 = sat
    //                      the first week is the week that contains the first
    //                      of this day of the week
    //                      (eg. ISO weeks use thursday (4))
    function weekOfYear(mom, firstDayOfWeek, firstDayOfWeekOfYear) {
        var end = firstDayOfWeekOfYear - firstDayOfWeek,
            daysToDayOfWeek = firstDayOfWeekOfYear - mom.day(),
            adjustedMoment;


        if (daysToDayOfWeek > end) {
            daysToDayOfWeek -= 7;
        }

        if (daysToDayOfWeek < end - 7) {
            daysToDayOfWeek += 7;
        }

        adjustedMoment = moment(mom).add('d', daysToDayOfWeek);
        return {
            week: Math.ceil(adjustedMoment.dayOfYear() / 7),
            year: adjustedMoment.year()
        };
    }


    /************************************
        Top Level Functions
    ************************************/

    function makeMoment(config) {
        var input = config._i,
            format = config._f;

        if (input === null || input === '') {
            return null;
        }

        if (typeof input === 'string') {
            config._i = input = getLangDefinition().preparse(input);
        }

        if (moment.isMoment(input)) {
            config = extend({}, input);
            config._d = new Date(+input._d);
        } else if (format) {
            if (isArray(format)) {
                makeDateFromStringAndArray(config);
            } else {
                makeDateFromStringAndFormat(config);
            }
        } else {
            makeDateFromInput(config);
        }

        return new Moment(config);
    }

    moment = function (input, format, lang) {
        return makeMoment({
            _i : input,
            _f : format,
            _l : lang,
            _isUTC : false
        });
    };

    // creating with utc
    moment.utc = function (input, format, lang) {
        return makeMoment({
            _useUTC : true,
            _isUTC : true,
            _l : lang,
            _i : input,
            _f : format
        }).utc();
    };

    // creating with unix timestamp (in seconds)
    moment.unix = function (input) {
        return moment(input * 1000);
    };

    // duration
    moment.duration = function (input, key) {
        var isDuration = moment.isDuration(input),
            isNumber = (typeof input === 'number'),
            duration = (isDuration ? input._input : (isNumber ? {} : input)),
            matched = aspNetTimeSpanJsonRegex.exec(input),
            sign,
            ret;

        if (isNumber) {
            if (key) {
                duration[key] = input;
            } else {
                duration.milliseconds = input;
            }
        } else if (matched) {
            sign = (matched[1] === "-") ? -1 : 1;
            duration = {
                y: 0,
                d: ~~matched[2] * sign,
                h: ~~matched[3] * sign,
                m: ~~matched[4] * sign,
                s: ~~matched[5] * sign,
                ms: ~~matched[6] * sign
            };
        }

        ret = new Duration(duration);

        if (isDuration && input.hasOwnProperty('_lang')) {
            ret._lang = input._lang;
        }

        return ret;
    };

    // version number
    moment.version = VERSION;

    // default format
    moment.defaultFormat = isoFormat;

    // This function will be called whenever a moment is mutated.
    // It is intended to keep the offset in sync with the timezone.
    moment.updateOffset = function () {};

    // This function will load languages and then set the global language.  If
    // no arguments are passed in, it will simply return the current global
    // language key.
    moment.lang = function (key, values) {
        if (!key) {
            return moment.fn._lang._abbr;
        }
        key = key.toLowerCase();
        key = key.replace('_', '-');
        if (values) {
            loadLang(key, values);
        } else if (values === null) {
            unloadLang(key);
            key = 'en';
        } else if (!languages[key]) {
            getLangDefinition(key);
        }
        moment.duration.fn._lang = moment.fn._lang = getLangDefinition(key);
    };

    // returns language data
    moment.langData = function (key) {
        if (key && key._lang && key._lang._abbr) {
            key = key._lang._abbr;
        }
        return getLangDefinition(key);
    };

    // compare moment object
    moment.isMoment = function (obj) {
        return obj instanceof Moment;
    };

    // for typechecking Duration objects
    moment.isDuration = function (obj) {
        return obj instanceof Duration;
    };


    /************************************
        Moment Prototype
    ************************************/


    extend(moment.fn = Moment.prototype, {

        clone : function () {
            return moment(this);
        },

        valueOf : function () {
            return +this._d + ((this._offset || 0) * 60000);
        },

        unix : function () {
            return Math.floor(+this / 1000);
        },

        toString : function () {
            return this.format("ddd MMM DD YYYY HH:mm:ss [GMT]ZZ");
        },

        toDate : function () {
            return this._offset ? new Date(+this) : this._d;
        },

        toISOString : function () {
            return formatMoment(moment(this).utc(), 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
        },

        toArray : function () {
            var m = this;
            return [
                m.year(),
                m.month(),
                m.date(),
                m.hours(),
                m.minutes(),
                m.seconds(),
                m.milliseconds()
            ];
        },

        isValid : function () {
            if (this._isValid == null) {
                if (this._a) {
                    this._isValid = !compareArrays(this._a, (this._isUTC ? moment.utc(this._a) : moment(this._a)).toArray());
                } else {
                    this._isValid = !isNaN(this._d.getTime());
                }
            }
            return !!this._isValid;
        },

        invalidAt: function () {
            var i, arr1 = this._a, arr2 = (this._isUTC ? moment.utc(this._a) : moment(this._a)).toArray();
            for (i = 6; i >= 0 && arr1[i] === arr2[i]; --i) {
                // empty loop body
            }
            return i;
        },

        utc : function () {
            return this.zone(0);
        },

        local : function () {
            this.zone(0);
            this._isUTC = false;
            return this;
        },

        format : function (inputString) {
            var output = formatMoment(this, inputString || moment.defaultFormat);
            return this.lang().postformat(output);
        },

        add : function (input, val) {
            var dur;
            // switch args to support add('s', 1) and add(1, 's')
            if (typeof input === 'string') {
                dur = moment.duration(+val, input);
            } else {
                dur = moment.duration(input, val);
            }
            addOrSubtractDurationFromMoment(this, dur, 1);
            return this;
        },

        subtract : function (input, val) {
            var dur;
            // switch args to support subtract('s', 1) and subtract(1, 's')
            if (typeof input === 'string') {
                dur = moment.duration(+val, input);
            } else {
                dur = moment.duration(input, val);
            }
            addOrSubtractDurationFromMoment(this, dur, -1);
            return this;
        },

        diff : function (input, units, asFloat) {
            var that = this._isUTC ? moment(input).zone(this._offset || 0) : moment(input).local(),
                zoneDiff = (this.zone() - that.zone()) * 6e4,
                diff, output;

            units = normalizeUnits(units);

            if (units === 'year' || units === 'month') {
                // average number of days in the months in the given dates
                diff = (this.daysInMonth() + that.daysInMonth()) * 432e5; // 24 * 60 * 60 * 1000 / 2
                // difference in months
                output = ((this.year() - that.year()) * 12) + (this.month() - that.month());
                // adjust by taking difference in days, average number of days
                // and dst in the given months.
                output += ((this - moment(this).startOf('month')) -
                        (that - moment(that).startOf('month'))) / diff;
                // same as above but with zones, to negate all dst
                output -= ((this.zone() - moment(this).startOf('month').zone()) -
                        (that.zone() - moment(that).startOf('month').zone())) * 6e4 / diff;
                if (units === 'year') {
                    output = output / 12;
                }
            } else {
                diff = (this - that);
                output = units === 'second' ? diff / 1e3 : // 1000
                    units === 'minute' ? diff / 6e4 : // 1000 * 60
                    units === 'hour' ? diff / 36e5 : // 1000 * 60 * 60
                    units === 'day' ? (diff - zoneDiff) / 864e5 : // 1000 * 60 * 60 * 24, negate dst
                    units === 'week' ? (diff - zoneDiff) / 6048e5 : // 1000 * 60 * 60 * 24 * 7, negate dst
                    diff;
            }
            return asFloat ? output : absRound(output);
        },

        from : function (time, withoutSuffix) {
            return moment.duration(this.diff(time)).lang(this.lang()._abbr).humanize(!withoutSuffix);
        },

        fromNow : function (withoutSuffix) {
            return this.from(moment(), withoutSuffix);
        },

        calendar : function () {
            var diff = this.diff(moment().zone(this.zone()).startOf('day'), 'days', true),
                format = diff < -6 ? 'sameElse' :
                diff < -1 ? 'lastWeek' :
                diff < 0 ? 'lastDay' :
                diff < 1 ? 'sameDay' :
                diff < 2 ? 'nextDay' :
                diff < 7 ? 'nextWeek' : 'sameElse';
            return this.format(this.lang().calendar(format, this));
        },

        isLeapYear : function () {
            var year = this.year();
            return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
        },

        isDST : function () {
            return (this.zone() < this.clone().month(0).zone() ||
                this.zone() < this.clone().month(5).zone());
        },

        day : function (input) {
            var day = this._isUTC ? this._d.getUTCDay() : this._d.getDay();
            if (input != null) {
                if (typeof input === 'string') {
                    input = this.lang().weekdaysParse(input);
                    if (typeof input !== 'number') {
                        return this;
                    }
                }
                return this.add({ d : input - day });
            } else {
                return day;
            }
        },

        month : function (input) {
            var utc = this._isUTC ? 'UTC' : '',
                dayOfMonth;

            if (input != null) {
                if (typeof input === 'string') {
                    input = this.lang().monthsParse(input);
                    if (typeof input !== 'number') {
                        return this;
                    }
                }

                dayOfMonth = this.date();
                this.date(1);
                this._d['set' + utc + 'Month'](input);
                this.date(Math.min(dayOfMonth, this.daysInMonth()));

                moment.updateOffset(this);
                return this;
            } else {
                return this._d['get' + utc + 'Month']();
            }
        },

        startOf: function (units) {
            units = normalizeUnits(units);
            // the following switch intentionally omits break keywords
            // to utilize falling through the cases.
            switch (units) {
            case 'year':
                this.month(0);
                /* falls through */
            case 'month':
                this.date(1);
                /* falls through */
            case 'week':
            case 'isoweek':
            case 'day':
                this.hours(0);
                /* falls through */
            case 'hour':
                this.minutes(0);
                /* falls through */
            case 'minute':
                this.seconds(0);
                /* falls through */
            case 'second':
                this.milliseconds(0);
                /* falls through */
            }

            // weeks are a special case
            if (units === 'week') {
                this.weekday(0);
            } else if (units === 'isoweek') {
                this.isoWeekday(1);
            }

            return this;
        },

        endOf: function (units) {
            units = normalizeUnits(units);
            return this.startOf(units).add((units === 'isoweek' ? 'week' : units), 1).subtract('ms', 1);
        },

        isAfter: function (input, units) {
            units = typeof units !== 'undefined' ? units : 'millisecond';
            return +this.clone().startOf(units) > +moment(input).startOf(units);
        },

        isBefore: function (input, units) {
            units = typeof units !== 'undefined' ? units : 'millisecond';
            return +this.clone().startOf(units) < +moment(input).startOf(units);
        },

        isSame: function (input, units) {
            units = typeof units !== 'undefined' ? units : 'millisecond';
            return +this.clone().startOf(units) === +moment(input).startOf(units);
        },

        min: function (other) {
            other = moment.apply(null, arguments);
            return other < this ? this : other;
        },

        max: function (other) {
            other = moment.apply(null, arguments);
            return other > this ? this : other;
        },

        zone : function (input) {
            var offset = this._offset || 0;
            if (input != null) {
                if (typeof input === "string") {
                    input = timezoneMinutesFromString(input);
                }
                if (Math.abs(input) < 16) {
                    input = input * 60;
                }
                this._offset = input;
                this._isUTC = true;
                if (offset !== input) {
                    addOrSubtractDurationFromMoment(this, moment.duration(offset - input, 'm'), 1, true);
                }
            } else {
                return this._isUTC ? offset : this._d.getTimezoneOffset();
            }
            return this;
        },

        zoneAbbr : function () {
            return this._isUTC ? "UTC" : "";
        },

        zoneName : function () {
            return this._isUTC ? "Coordinated Universal Time" : "";
        },

        hasAlignedHourOffset : function (input) {
            if (!input) {
                input = 0;
            }
            else {
                input = moment(input).zone();
            }

            return (this.zone() - input) % 60 === 0;
        },

        daysInMonth : function () {
            return moment.utc([this.year(), this.month() + 1, 0]).date();
        },

        dayOfYear : function (input) {
            var dayOfYear = round((moment(this).startOf('day') - moment(this).startOf('year')) / 864e5) + 1;
            return input == null ? dayOfYear : this.add("d", (input - dayOfYear));
        },

        weekYear : function (input) {
            var year = weekOfYear(this, this.lang()._week.dow, this.lang()._week.doy).year;
            return input == null ? year : this.add("y", (input - year));
        },

        isoWeekYear : function (input) {
            var year = weekOfYear(this, 1, 4).year;
            return input == null ? year : this.add("y", (input - year));
        },

        week : function (input) {
            var week = this.lang().week(this);
            return input == null ? week : this.add("d", (input - week) * 7);
        },

        isoWeek : function (input) {
            var week = weekOfYear(this, 1, 4).week;
            return input == null ? week : this.add("d", (input - week) * 7);
        },

        weekday : function (input) {
            var weekday = (this._d.getDay() + 7 - this.lang()._week.dow) % 7;
            return input == null ? weekday : this.add("d", input - weekday);
        },

        isoWeekday : function (input) {
            // behaves the same as moment#day except
            // as a getter, returns 7 instead of 0 (1-7 range instead of 0-6)
            // as a setter, sunday should belong to the previous week.
            return input == null ? this.day() || 7 : this.day(this.day() % 7 ? input : input - 7);
        },

        get : function (units) {
            units = normalizeUnits(units);
            return this[units.toLowerCase()]();
        },

        set : function (units, value) {
            units = normalizeUnits(units);
            this[units.toLowerCase()](value);
        },

        // If passed a language key, it will set the language for this
        // instance.  Otherwise, it will return the language configuration
        // variables for this instance.
        lang : function (key) {
            if (key === undefined) {
                return this._lang;
            } else {
                this._lang = getLangDefinition(key);
                return this;
            }
        }
    });

    // helper for adding shortcuts
    function makeGetterAndSetter(name, key) {
        moment.fn[name] = moment.fn[name + 's'] = function (input) {
            var utc = this._isUTC ? 'UTC' : '';
            if (input != null) {
                this._d['set' + utc + key](input);
                moment.updateOffset(this);
                return this;
            } else {
                return this._d['get' + utc + key]();
            }
        };
    }

    // loop through and add shortcuts (Month, Date, Hours, Minutes, Seconds, Milliseconds)
    for (i = 0; i < proxyGettersAndSetters.length; i ++) {
        makeGetterAndSetter(proxyGettersAndSetters[i].toLowerCase().replace(/s$/, ''), proxyGettersAndSetters[i]);
    }

    // add shortcut for year (uses different syntax than the getter/setter 'year' == 'FullYear')
    makeGetterAndSetter('year', 'FullYear');

    // add plural methods
    moment.fn.days = moment.fn.day;
    moment.fn.months = moment.fn.month;
    moment.fn.weeks = moment.fn.week;
    moment.fn.isoWeeks = moment.fn.isoWeek;

    // add aliased format methods
    moment.fn.toJSON = moment.fn.toISOString;

    /************************************
        Duration Prototype
    ************************************/


    extend(moment.duration.fn = Duration.prototype, {

        _bubble : function () {
            var milliseconds = this._milliseconds,
                days = this._days,
                months = this._months,
                data = this._data,
                seconds, minutes, hours, years;

            // The following code bubbles up values, see the tests for
            // examples of what that means.
            data.milliseconds = milliseconds % 1000;

            seconds = absRound(milliseconds / 1000);
            data.seconds = seconds % 60;

            minutes = absRound(seconds / 60);
            data.minutes = minutes % 60;

            hours = absRound(minutes / 60);
            data.hours = hours % 24;

            days += absRound(hours / 24);
            data.days = days % 30;

            months += absRound(days / 30);
            data.months = months % 12;

            years = absRound(months / 12);
            data.years = years;
        },

        weeks : function () {
            return absRound(this.days() / 7);
        },

        valueOf : function () {
            return this._milliseconds +
              this._days * 864e5 +
              (this._months % 12) * 2592e6 +
              ~~(this._months / 12) * 31536e6;
        },

        humanize : function (withSuffix) {
            var difference = +this,
                output = relativeTime(difference, !withSuffix, this.lang());

            if (withSuffix) {
                output = this.lang().pastFuture(difference, output);
            }

            return this.lang().postformat(output);
        },

        add : function (input, val) {
            // supports only 2.0-style add(1, 's') or add(moment)
            var dur = moment.duration(input, val);

            this._milliseconds += dur._milliseconds;
            this._days += dur._days;
            this._months += dur._months;

            this._bubble();

            return this;
        },

        subtract : function (input, val) {
            var dur = moment.duration(input, val);

            this._milliseconds -= dur._milliseconds;
            this._days -= dur._days;
            this._months -= dur._months;

            this._bubble();

            return this;
        },

        get : function (units) {
            units = normalizeUnits(units);
            return this[units.toLowerCase() + 's']();
        },

        as : function (units) {
            units = normalizeUnits(units);
            return this['as' + units.charAt(0).toUpperCase() + units.slice(1) + 's']();
        },

        lang : moment.fn.lang
    });

    function makeDurationGetter(name) {
        moment.duration.fn[name] = function () {
            return this._data[name];
        };
    }

    function makeDurationAsGetter(name, factor) {
        moment.duration.fn['as' + name] = function () {
            return +this / factor;
        };
    }

    for (i in unitMillisecondFactors) {
        if (unitMillisecondFactors.hasOwnProperty(i)) {
            makeDurationAsGetter(i, unitMillisecondFactors[i]);
            makeDurationGetter(i.toLowerCase());
        }
    }

    makeDurationAsGetter('Weeks', 6048e5);
    moment.duration.fn.asMonths = function () {
        return (+this - this.years() * 31536e6) / 2592e6 + this.years() * 12;
    };


    /************************************
        Default Lang
    ************************************/


    // Set default language, other languages will inherit from English.
    moment.lang('en', {
        ordinal : function (number) {
            var b = number % 10,
                output = (~~ (number % 100 / 10) === 1) ? 'th' :
                (b === 1) ? 'st' :
                (b === 2) ? 'nd' :
                (b === 3) ? 'rd' : 'th';
            return number + output;
        }
    });

    // moment.js language configuration
// language : Moroccan Arabic (ar-ma)
// author : ElFadili Yassine : https://github.com/ElFadiliY
// author : Abdel Said : https://github.com/abdelsaid

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('ar-ma', {
        months : "يناير_فبراير_مارس_أبريل_ماي_يونيو_يوليوز_غشت_شتنبر_أكتوبر_نونبر_دجنبر".split("_"),
        monthsShort : "يناير_فبراير_مارس_أبريل_ماي_يونيو_يوليوز_غشت_شتنبر_أكتوبر_نونبر_دجنبر".split("_"),
        weekdays : "الأحد_الإتنين_الثلاثاء_الأربعاء_الخميس_الجمعة_السبت".split("_"),
        weekdaysShort : "احد_اتنين_ثلاثاء_اربعاء_خميس_جمعة_سبت".split("_"),
        weekdaysMin : "ح_ن_ث_ر_خ_ج_س".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd D MMMM YYYY LT"
        },
        calendar : {
            sameDay: "[اليوم على الساعة] LT",
            nextDay: '[غدا على الساعة] LT',
            nextWeek: 'dddd [على الساعة] LT',
            lastDay: '[أمس على الساعة] LT',
            lastWeek: 'dddd [على الساعة] LT',
            sameElse: 'L'
        },
        relativeTime : {
            future : "في %s",
            past : "منذ %s",
            s : "ثوان",
            m : "دقيقة",
            mm : "%d دقائق",
            h : "ساعة",
            hh : "%d ساعات",
            d : "يوم",
            dd : "%d أيام",
            M : "شهر",
            MM : "%d أشهر",
            y : "سنة",
            yy : "%d سنوات"
        },
        week : {
            dow : 6, // Saturday is the first day of the week.
            doy : 12  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : Arabic (ar)
// author : Abdel Said : https://github.com/abdelsaid
// changes in months, weekdays : Ahmed Elkhatib

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('ar', {
        months : "يناير/ كانون الثاني_فبراير/ شباط_مارس/ آذار_أبريل/ نيسان_مايو/ أيار_يونيو/ حزيران_يوليو/ تموز_أغسطس/ آب_سبتمبر/ أيلول_أكتوبر/ تشرين الأول_نوفمبر/ تشرين الثاني_ديسمبر/ كانون الأول".split("_"),
        monthsShort : "يناير/ كانون الثاني_فبراير/ شباط_مارس/ آذار_أبريل/ نيسان_مايو/ أيار_يونيو/ حزيران_يوليو/ تموز_أغسطس/ آب_سبتمبر/ أيلول_أكتوبر/ تشرين الأول_نوفمبر/ تشرين الثاني_ديسمبر/ كانون الأول".split("_"),
        weekdays : "الأحد_الإثنين_الثلاثاء_الأربعاء_الخميس_الجمعة_السبت".split("_"),
        weekdaysShort : "الأحد_الإثنين_الثلاثاء_الأربعاء_الخميس_الجمعة_السبت".split("_"),
        weekdaysMin : "ح_ن_ث_ر_خ_ج_س".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd D MMMM YYYY LT"
        },
        calendar : {
            sameDay: "[اليوم على الساعة] LT",
            nextDay: '[غدا على الساعة] LT',
            nextWeek: 'dddd [على الساعة] LT',
            lastDay: '[أمس على الساعة] LT',
            lastWeek: 'dddd [على الساعة] LT',
            sameElse: 'L'
        },
        relativeTime : {
            future : "في %s",
            past : "منذ %s",
            s : "ثوان",
            m : "دقيقة",
            mm : "%d دقائق",
            h : "ساعة",
            hh : "%d ساعات",
            d : "يوم",
            dd : "%d أيام",
            M : "شهر",
            MM : "%d أشهر",
            y : "سنة",
            yy : "%d سنوات"
        },
        week : {
            dow : 6, // Saturday is the first day of the week.
            doy : 12  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : bulgarian (bg)
// author : Krasen Borisov : https://github.com/kraz

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('bg', {
        months : "януари_февруари_март_април_май_юни_юли_август_септември_октомври_ноември_декември".split("_"),
        monthsShort : "янр_фев_мар_апр_май_юни_юли_авг_сеп_окт_ное_дек".split("_"),
        weekdays : "неделя_понеделник_вторник_сряда_четвъртък_петък_събота".split("_"),
        weekdaysShort : "нед_пон_вто_сря_чет_пет_съб".split("_"),
        weekdaysMin : "нд_пн_вт_ср_чт_пт_сб".split("_"),
        longDateFormat : {
            LT : "h:mm",
            L : "D.MM.YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd, D MMMM YYYY LT"
        },
        calendar : {
            sameDay : '[Днес в] LT',
            nextDay : '[Утре в] LT',
            nextWeek : 'dddd [в] LT',
            lastDay : '[Вчера в] LT',
            lastWeek : function () {
                switch (this.day()) {
                case 0:
                case 3:
                case 6:
                    return '[В изминалата] dddd [в] LT';
                case 1:
                case 2:
                case 4:
                case 5:
                    return '[В изминалия] dddd [в] LT';
                }
            },
            sameElse : 'L'
        },
        relativeTime : {
            future : "след %s",
            past : "преди %s",
            s : "няколко секунди",
            m : "минута",
            mm : "%d минути",
            h : "час",
            hh : "%d часа",
            d : "ден",
            dd : "%d дни",
            M : "месец",
            MM : "%d месеца",
            y : "година",
            yy : "%d години"
        },
        ordinal : function (number) {
            var lastDigit = number % 10,
                last2Digits = number % 100;
            if (number === 0) {
                return number + '-ев';
            } else if (last2Digits === 0) {
                return number + '-ен';
            } else if (last2Digits > 10 && last2Digits < 20) {
                return number + '-ти';
            } else if (lastDigit === 1) {
                return number + '-ви';
            } else if (lastDigit === 2) {
                return number + '-ри';
            } else if (lastDigit === 7 || lastDigit === 8) {
                return number + '-ми';
            } else {
                return number + '-ти';
            }
        },
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 7  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : breton (br)
// author : Jean-Baptiste Le Duigou : https://github.com/jbleduigou

(function (factory) {
    factory(moment);
}(function (moment) {
    function relativeTimeWithMutation(number, withoutSuffix, key) {
        var format = {
            'mm': "munutenn",
            'MM': "miz",
            'dd': "devezh"
        };
        return number + ' ' + mutation(format[key], number);
    }

    function specialMutationForYears(number) {
        switch (lastNumber(number)) {
        case 1:
        case 3:
        case 4:
        case 5:
        case 9:
            return number + ' bloaz';
        default:
            return number + ' vloaz';
        }
    }

    function lastNumber(number) {
        if (number > 9) {
            return lastNumber(number % 10);
        }
        return number;
    }

    function mutation(text, number) {
        if (number === 2) {
            return softMutation(text);
        }
        return text;
    }

    function softMutation(text) {
        var mutationTable = {
            'm': 'v',
            'b': 'v',
            'd': 'z'
        };
        if (mutationTable[text.charAt(0)] === undefined) {
            return text;
        }
        return mutationTable[text.charAt(0)] + text.substring(1);
    }

    moment.lang('br', {
        months : "Genver_C'hwevrer_Meurzh_Ebrel_Mae_Mezheven_Gouere_Eost_Gwengolo_Here_Du_Kerzu".split("_"),
        monthsShort : "Gen_C'hwe_Meu_Ebr_Mae_Eve_Gou_Eos_Gwe_Her_Du_Ker".split("_"),
        weekdays : "Sul_Lun_Meurzh_Merc'her_Yaou_Gwener_Sadorn".split("_"),
        weekdaysShort : "Sul_Lun_Meu_Mer_Yao_Gwe_Sad".split("_"),
        weekdaysMin : "Su_Lu_Me_Mer_Ya_Gw_Sa".split("_"),
        longDateFormat : {
            LT : "h[e]mm A",
            L : "DD/MM/YYYY",
            LL : "D [a viz] MMMM YYYY",
            LLL : "D [a viz] MMMM YYYY LT",
            LLLL : "dddd, D [a viz] MMMM YYYY LT"
        },
        calendar : {
            sameDay : '[Hiziv da] LT',
            nextDay : '[Warc\'hoazh da] LT',
            nextWeek : 'dddd [da] LT',
            lastDay : '[Dec\'h da] LT',
            lastWeek : 'dddd [paset da] LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "a-benn %s",
            past : "%s 'zo",
            s : "un nebeud segondennoù",
            m : "ur vunutenn",
            mm : relativeTimeWithMutation,
            h : "un eur",
            hh : "%d eur",
            d : "un devezh",
            dd : relativeTimeWithMutation,
            M : "ur miz",
            MM : relativeTimeWithMutation,
            y : "ur bloaz",
            yy : specialMutationForYears
        },
        ordinal : function (number) {
            var output = (number === 1) ? 'añ' : 'vet';
            return number + output;
        },
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : catalan (ca)
// author : Juan G. Hurtado : https://github.com/juanghurtado

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('ca', {
        months : "Gener_Febrer_Març_Abril_Maig_Juny_Juliol_Agost_Setembre_Octubre_Novembre_Desembre".split("_"),
        monthsShort : "Gen._Febr._Mar._Abr._Mai._Jun._Jul._Ag._Set._Oct._Nov._Des.".split("_"),
        weekdays : "Diumenge_Dilluns_Dimarts_Dimecres_Dijous_Divendres_Dissabte".split("_"),
        weekdaysShort : "Dg._Dl._Dt._Dc._Dj._Dv._Ds.".split("_"),
        weekdaysMin : "Dg_Dl_Dt_Dc_Dj_Dv_Ds".split("_"),
        longDateFormat : {
            LT : "H:mm",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd D MMMM YYYY LT"
        },
        calendar : {
            sameDay : function () {
                return '[avui a ' + ((this.hours() !== 1) ? 'les' : 'la') + '] LT';
            },
            nextDay : function () {
                return '[demà a ' + ((this.hours() !== 1) ? 'les' : 'la') + '] LT';
            },
            nextWeek : function () {
                return 'dddd [a ' + ((this.hours() !== 1) ? 'les' : 'la') + '] LT';
            },
            lastDay : function () {
                return '[ahir a ' + ((this.hours() !== 1) ? 'les' : 'la') + '] LT';
            },
            lastWeek : function () {
                return '[el] dddd [passat a ' + ((this.hours() !== 1) ? 'les' : 'la') + '] LT';
            },
            sameElse : 'L'
        },
        relativeTime : {
            future : "en %s",
            past : "fa %s",
            s : "uns segons",
            m : "un minut",
            mm : "%d minuts",
            h : "una hora",
            hh : "%d hores",
            d : "un dia",
            dd : "%d dies",
            M : "un mes",
            MM : "%d mesos",
            y : "un any",
            yy : "%d anys"
        },
        ordinal : '%dº',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : czech (cs)
// author : petrbela : https://github.com/petrbela

(function (factory) {
    factory(moment);
}(function (moment) {
    var months = "leden_únor_březen_duben_květen_červen_červenec_srpen_září_říjen_listopad_prosinec".split("_"),
        monthsShort = "led_úno_bře_dub_kvě_čvn_čvc_srp_zář_říj_lis_pro".split("_");

    function plural(n) {
        return (n > 1) && (n < 5) && (~~(n / 10) !== 1);
    }

    function translate(number, withoutSuffix, key, isFuture) {
        var result = number + " ";
        switch (key) {
        case 's':  // a few seconds / in a few seconds / a few seconds ago
            return (withoutSuffix || isFuture) ? 'pár vteřin' : 'pár vteřinami';
        case 'm':  // a minute / in a minute / a minute ago
            return withoutSuffix ? 'minuta' : (isFuture ? 'minutu' : 'minutou');
        case 'mm': // 9 minutes / in 9 minutes / 9 minutes ago
            if (withoutSuffix || isFuture) {
                return result + (plural(number) ? 'minuty' : 'minut');
            } else {
                return result + 'minutami';
            }
            break;
        case 'h':  // an hour / in an hour / an hour ago
            return withoutSuffix ? 'hodina' : (isFuture ? 'hodinu' : 'hodinou');
        case 'hh': // 9 hours / in 9 hours / 9 hours ago
            if (withoutSuffix || isFuture) {
                return result + (plural(number) ? 'hodiny' : 'hodin');
            } else {
                return result + 'hodinami';
            }
            break;
        case 'd':  // a day / in a day / a day ago
            return (withoutSuffix || isFuture) ? 'den' : 'dnem';
        case 'dd': // 9 days / in 9 days / 9 days ago
            if (withoutSuffix || isFuture) {
                return result + (plural(number) ? 'dny' : 'dní');
            } else {
                return result + 'dny';
            }
            break;
        case 'M':  // a month / in a month / a month ago
            return (withoutSuffix || isFuture) ? 'měsíc' : 'měsícem';
        case 'MM': // 9 months / in 9 months / 9 months ago
            if (withoutSuffix || isFuture) {
                return result + (plural(number) ? 'měsíce' : 'měsíců');
            } else {
                return result + 'měsíci';
            }
            break;
        case 'y':  // a year / in a year / a year ago
            return (withoutSuffix || isFuture) ? 'rok' : 'rokem';
        case 'yy': // 9 years / in 9 years / 9 years ago
            if (withoutSuffix || isFuture) {
                return result + (plural(number) ? 'roky' : 'let');
            } else {
                return result + 'lety';
            }
            break;
        }
    }

    moment.lang('cs', {
        months : months,
        monthsShort : monthsShort,
        monthsParse : (function (months, monthsShort) {
            var i, _monthsParse = [];
            for (i = 0; i < 12; i++) {
                // use custom parser to solve problem with July (červenec)
                _monthsParse[i] = new RegExp('^' + months[i] + '$|^' + monthsShort[i] + '$', 'i');
            }
            return _monthsParse;
        }(months, monthsShort)),
        weekdays : "neděle_pondělí_úterý_středa_čtvrtek_pátek_sobota".split("_"),
        weekdaysShort : "ne_po_út_st_čt_pá_so".split("_"),
        weekdaysMin : "ne_po_út_st_čt_pá_so".split("_"),
        longDateFormat : {
            LT: "H:mm",
            L : "DD.MM.YYYY",
            LL : "D. MMMM YYYY",
            LLL : "D. MMMM YYYY LT",
            LLLL : "dddd D. MMMM YYYY LT"
        },
        calendar : {
            sameDay: "[dnes v] LT",
            nextDay: '[zítra v] LT',
            nextWeek: function () {
                switch (this.day()) {
                case 0:
                    return '[v neděli v] LT';
                case 1:
                case 2:
                    return '[v] dddd [v] LT';
                case 3:
                    return '[ve středu v] LT';
                case 4:
                    return '[ve čtvrtek v] LT';
                case 5:
                    return '[v pátek v] LT';
                case 6:
                    return '[v sobotu v] LT';
                }
            },
            lastDay: '[včera v] LT',
            lastWeek: function () {
                switch (this.day()) {
                case 0:
                    return '[minulou neděli v] LT';
                case 1:
                case 2:
                    return '[minulé] dddd [v] LT';
                case 3:
                    return '[minulou středu v] LT';
                case 4:
                case 5:
                    return '[minulý] dddd [v] LT';
                case 6:
                    return '[minulou sobotu v] LT';
                }
            },
            sameElse: "L"
        },
        relativeTime : {
            future : "za %s",
            past : "před %s",
            s : translate,
            m : translate,
            mm : translate,
            h : translate,
            hh : translate,
            d : translate,
            dd : translate,
            M : translate,
            MM : translate,
            y : translate,
            yy : translate
        },
        ordinal : '%d.',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : chuvash (cv)
// author : Anatoly Mironov : https://github.com/mirontoli

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('cv', {
        months : "кăрлач_нарăс_пуш_ака_май_çĕртме_утă_çурла_авăн_юпа_чӳк_раштав".split("_"),
        monthsShort : "кăр_нар_пуш_ака_май_çĕр_утă_çур_ав_юпа_чӳк_раш".split("_"),
        weekdays : "вырсарникун_тунтикун_ытларикун_юнкун_кĕçнерникун_эрнекун_шăматкун".split("_"),
        weekdaysShort : "выр_тун_ытл_юн_кĕç_эрн_шăм".split("_"),
        weekdaysMin : "вр_тн_ыт_юн_кç_эр_шм".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD-MM-YYYY",
            LL : "YYYY [çулхи] MMMM [уйăхĕн] D[-мĕшĕ]",
            LLL : "YYYY [çулхи] MMMM [уйăхĕн] D[-мĕшĕ], LT",
            LLLL : "dddd, YYYY [çулхи] MMMM [уйăхĕн] D[-мĕшĕ], LT"
        },
        calendar : {
            sameDay: '[Паян] LT [сехетре]',
            nextDay: '[Ыран] LT [сехетре]',
            lastDay: '[Ĕнер] LT [сехетре]',
            nextWeek: '[Çитес] dddd LT [сехетре]',
            lastWeek: '[Иртнĕ] dddd LT [сехетре]',
            sameElse: 'L'
        },
        relativeTime : {
            future : function (output) {
                var affix = /сехет$/i.exec(output) ? "рен" : /çул$/i.exec(output) ? "тан" : "ран";
                return output + affix;
            },
            past : "%s каялла",
            s : "пĕр-ик çеккунт",
            m : "пĕр минут",
            mm : "%d минут",
            h : "пĕр сехет",
            hh : "%d сехет",
            d : "пĕр кун",
            dd : "%d кун",
            M : "пĕр уйăх",
            MM : "%d уйăх",
            y : "пĕр çул",
            yy : "%d çул"
        },
        ordinal : '%d-мĕш',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 7  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : danish (da)
// author : Ulrik Nielsen : https://github.com/mrbase

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('da', {
        months : "januar_februar_marts_april_maj_juni_juli_august_september_oktober_november_december".split("_"),
        monthsShort : "jan_feb_mar_apr_maj_jun_jul_aug_sep_okt_nov_dec".split("_"),
        weekdays : "søndag_mandag_tirsdag_onsdag_torsdag_fredag_lørdag".split("_"),
        weekdaysShort : "søn_man_tir_ons_tor_fre_lør".split("_"),
        weekdaysMin : "sø_ma_ti_on_to_fr_lø".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd D. MMMM, YYYY LT"
        },
        calendar : {
            sameDay : '[I dag kl.] LT',
            nextDay : '[I morgen kl.] LT',
            nextWeek : 'dddd [kl.] LT',
            lastDay : '[I går kl.] LT',
            lastWeek : '[sidste] dddd [kl] LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "om %s",
            past : "%s siden",
            s : "få sekunder",
            m : "et minut",
            mm : "%d minutter",
            h : "en time",
            hh : "%d timer",
            d : "en dag",
            dd : "%d dage",
            M : "en måned",
            MM : "%d måneder",
            y : "et år",
            yy : "%d år"
        },
        ordinal : '%d.',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : german (de)
// author : lluchs : https://github.com/lluchs
// author: Menelion Elensúle: https://github.com/Oire

(function (factory) {
    factory(moment);
}(function (moment) {
    function processRelativeTime(number, withoutSuffix, key, isFuture) {
        var format = {
            'm': ['eine Minute', 'einer Minute'],
            'h': ['eine Stunde', 'einer Stunde'],
            'd': ['ein Tag', 'einem Tag'],
            'dd': [number + ' Tage', number + ' Tagen'],
            'M': ['ein Monat', 'einem Monat'],
            'MM': [number + ' Monate', number + ' Monaten'],
            'y': ['ein Jahr', 'einem Jahr'],
            'yy': [number + ' Jahre', number + ' Jahren']
        };
        return withoutSuffix ? format[key][0] : format[key][1];
    }

    moment.lang('de', {
        months : "Januar_Februar_März_April_Mai_Juni_Juli_August_September_Oktober_November_Dezember".split("_"),
        monthsShort : "Jan._Febr._Mrz._Apr._Mai_Jun._Jul._Aug._Sept._Okt._Nov._Dez.".split("_"),
        weekdays : "Sonntag_Montag_Dienstag_Mittwoch_Donnerstag_Freitag_Samstag".split("_"),
        weekdaysShort : "So._Mo._Di._Mi._Do._Fr._Sa.".split("_"),
        weekdaysMin : "So_Mo_Di_Mi_Do_Fr_Sa".split("_"),
        longDateFormat : {
            LT: "H:mm [Uhr]",
            L : "DD.MM.YYYY",
            LL : "D. MMMM YYYY",
            LLL : "D. MMMM YYYY LT",
            LLLL : "dddd, D. MMMM YYYY LT"
        },
        calendar : {
            sameDay: "[Heute um] LT",
            sameElse: "L",
            nextDay: '[Morgen um] LT',
            nextWeek: 'dddd [um] LT',
            lastDay: '[Gestern um] LT',
            lastWeek: '[letzten] dddd [um] LT'
        },
        relativeTime : {
            future : "in %s",
            past : "vor %s",
            s : "ein paar Sekunden",
            m : processRelativeTime,
            mm : "%d Minuten",
            h : processRelativeTime,
            hh : "%d Stunden",
            d : processRelativeTime,
            dd : processRelativeTime,
            M : processRelativeTime,
            MM : processRelativeTime,
            y : processRelativeTime,
            yy : processRelativeTime
        },
        ordinal : '%d.',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : modern greek (el)
// author : Aggelos Karalias : https://github.com/mehiel

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('el', {
        monthsNominativeEl : "Ιανουάριος_Φεβρουάριος_Μάρτιος_Απρίλιος_Μάιος_Ιούνιος_Ιούλιος_Αύγουστος_Σεπτέμβριος_Οκτώβριος_Νοέμβριος_Δεκέμβριος".split("_"),
        monthsGenitiveEl : "Ιανουαρίου_Φεβρουαρίου_Μαρτίου_Απριλίου_Μαΐου_Ιουνίου_Ιουλίου_Αυγούστου_Σεπτεμβρίου_Οκτωβρίου_Νοεμβρίου_Δεκεμβρίου".split("_"),
        months : function (momentToFormat, format) {
            if (/D/.test(format.substring(0, format.indexOf("MMMM")))) { // if there is a day number before 'MMMM'
                return this._monthsGenitiveEl[momentToFormat.month()];
            } else {
                return this._monthsNominativeEl[momentToFormat.month()];
            }
        },
        monthsShort : "Ιαν_Φεβ_Μαρ_Απρ_Μαϊ_Ιουν_Ιουλ_Αυγ_Σεπ_Οκτ_Νοε_Δεκ".split("_"),
        weekdays : "Κυριακή_Δευτέρα_Τρίτη_Τετάρτη_Πέμπτη_Παρασκευή_Σάββατο".split("_"),
        weekdaysShort : "Κυρ_Δευ_Τρι_Τετ_Πεμ_Παρ_Σαβ".split("_"),
        weekdaysMin : "Κυ_Δε_Τρ_Τε_Πε_Πα_Σα".split("_"),
        meridiem : function (hours, minutes, isLower) {
            if (hours > 11) {
                return isLower ? 'μμ' : 'ΜΜ';
            } else {
                return isLower ? 'πμ' : 'ΠΜ';
            }
        },
        longDateFormat : {
            LT : "h:mm A",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd, D MMMM YYYY LT"
        },
        calendarEl : {
            sameDay : '[Σήμερα {}] LT',
            nextDay : '[Αύριο {}] LT',
            nextWeek : 'dddd [{}] LT',
            lastDay : '[Χθες {}] LT',
            lastWeek : '[την προηγούμενη] dddd [{}] LT',
            sameElse : 'L'
        },
        calendar : function (key, mom) {
            var output = this._calendarEl[key],
                hours = mom && mom.hours();

            return output.replace("{}", (hours % 12 === 1 ? "στη" : "στις"));
        },
        relativeTime : {
            future : "σε %s",
            past : "%s πριν",
            s : "δευτερόλεπτα",
            m : "ένα λεπτό",
            mm : "%d λεπτά",
            h : "μία ώρα",
            hh : "%d ώρες",
            d : "μία μέρα",
            dd : "%d μέρες",
            M : "ένας μήνας",
            MM : "%d μήνες",
            y : "ένας χρόνος",
            yy : "%d χρόνια"
        },
        ordinal : function (number) {
            return number + 'η';
        },
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : canadian english (en-ca)
// author : Jonathan Abourbih : https://github.com/jonbca

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('en-ca', {
        months : "January_February_March_April_May_June_July_August_September_October_November_December".split("_"),
        monthsShort : "Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec".split("_"),
        weekdays : "Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday".split("_"),
        weekdaysShort : "Sun_Mon_Tue_Wed_Thu_Fri_Sat".split("_"),
        weekdaysMin : "Su_Mo_Tu_We_Th_Fr_Sa".split("_"),
        longDateFormat : {
            LT : "h:mm A",
            L : "YYYY-MM-DD",
            LL : "D MMMM, YYYY",
            LLL : "D MMMM, YYYY LT",
            LLLL : "dddd, D MMMM, YYYY LT"
        },
        calendar : {
            sameDay : '[Today at] LT',
            nextDay : '[Tomorrow at] LT',
            nextWeek : 'dddd [at] LT',
            lastDay : '[Yesterday at] LT',
            lastWeek : '[Last] dddd [at] LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "in %s",
            past : "%s ago",
            s : "a few seconds",
            m : "a minute",
            mm : "%d minutes",
            h : "an hour",
            hh : "%d hours",
            d : "a day",
            dd : "%d days",
            M : "a month",
            MM : "%d months",
            y : "a year",
            yy : "%d years"
        },
        ordinal : function (number) {
            var b = number % 10,
                output = (~~ (number % 100 / 10) === 1) ? 'th' :
                (b === 1) ? 'st' :
                (b === 2) ? 'nd' :
                (b === 3) ? 'rd' : 'th';
            return number + output;
        }
    });
}));
// moment.js language configuration
// language : great britain english (en-gb)
// author : Chris Gedrim : https://github.com/chrisgedrim

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('en-gb', {
        months : "January_February_March_April_May_June_July_August_September_October_November_December".split("_"),
        monthsShort : "Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec".split("_"),
        weekdays : "Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday".split("_"),
        weekdaysShort : "Sun_Mon_Tue_Wed_Thu_Fri_Sat".split("_"),
        weekdaysMin : "Su_Mo_Tu_We_Th_Fr_Sa".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd, D MMMM YYYY LT"
        },
        calendar : {
            sameDay : '[Today at] LT',
            nextDay : '[Tomorrow at] LT',
            nextWeek : 'dddd [at] LT',
            lastDay : '[Yesterday at] LT',
            lastWeek : '[Last] dddd [at] LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "in %s",
            past : "%s ago",
            s : "a few seconds",
            m : "a minute",
            mm : "%d minutes",
            h : "an hour",
            hh : "%d hours",
            d : "a day",
            dd : "%d days",
            M : "a month",
            MM : "%d months",
            y : "a year",
            yy : "%d years"
        },
        ordinal : function (number) {
            var b = number % 10,
                output = (~~ (number % 100 / 10) === 1) ? 'th' :
                (b === 1) ? 'st' :
                (b === 2) ? 'nd' :
                (b === 3) ? 'rd' : 'th';
            return number + output;
        },
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : esperanto (eo)
// author : Colin Dean : https://github.com/colindean
// komento: Mi estas malcerta se mi korekte traktis akuzativojn en tiu traduko.
//          Se ne, bonvolu korekti kaj avizi min por ke mi povas lerni!

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('eo', {
        months : "januaro_februaro_marto_aprilo_majo_junio_julio_aŭgusto_septembro_oktobro_novembro_decembro".split("_"),
        monthsShort : "jan_feb_mar_apr_maj_jun_jul_aŭg_sep_okt_nov_dec".split("_"),
        weekdays : "Dimanĉo_Lundo_Mardo_Merkredo_Ĵaŭdo_Vendredo_Sabato".split("_"),
        weekdaysShort : "Dim_Lun_Mard_Merk_Ĵaŭ_Ven_Sab".split("_"),
        weekdaysMin : "Di_Lu_Ma_Me_Ĵa_Ve_Sa".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "YYYY-MM-DD",
            LL : "D[-an de] MMMM, YYYY",
            LLL : "D[-an de] MMMM, YYYY LT",
            LLLL : "dddd, [la] D[-an de] MMMM, YYYY LT"
        },
        meridiem : function (hours, minutes, isLower) {
            if (hours > 11) {
                return isLower ? 'p.t.m.' : 'P.T.M.';
            } else {
                return isLower ? 'a.t.m.' : 'A.T.M.';
            }
        },
        calendar : {
            sameDay : '[Hodiaŭ je] LT',
            nextDay : '[Morgaŭ je] LT',
            nextWeek : 'dddd [je] LT',
            lastDay : '[Hieraŭ je] LT',
            lastWeek : '[pasinta] dddd [je] LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "je %s",
            past : "antaŭ %s",
            s : "sekundoj",
            m : "minuto",
            mm : "%d minutoj",
            h : "horo",
            hh : "%d horoj",
            d : "tago",//ne 'diurno', ĉar estas uzita por proksimumo
            dd : "%d tagoj",
            M : "monato",
            MM : "%d monatoj",
            y : "jaro",
            yy : "%d jaroj"
        },
        ordinal : "%da",
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 7  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : spanish (es)
// author : Julio Napurí : https://github.com/julionc

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('es', {
        months : "enero_febrero_marzo_abril_mayo_junio_julio_agosto_septiembre_octubre_noviembre_diciembre".split("_"),
        monthsShort : "ene._feb._mar._abr._may._jun._jul._ago._sep._oct._nov._dic.".split("_"),
        weekdays : "domingo_lunes_martes_miércoles_jueves_viernes_sábado".split("_"),
        weekdaysShort : "dom._lun._mar._mié._jue._vie._sáb.".split("_"),
        weekdaysMin : "Do_Lu_Ma_Mi_Ju_Vi_Sá".split("_"),
        longDateFormat : {
            LT : "H:mm",
            L : "DD/MM/YYYY",
            LL : "D [de] MMMM [de] YYYY",
            LLL : "D [de] MMMM [de] YYYY LT",
            LLLL : "dddd, D [de] MMMM [de] YYYY LT"
        },
        calendar : {
            sameDay : function () {
                return '[hoy a la' + ((this.hours() !== 1) ? 's' : '') + '] LT';
            },
            nextDay : function () {
                return '[mañana a la' + ((this.hours() !== 1) ? 's' : '') + '] LT';
            },
            nextWeek : function () {
                return 'dddd [a la' + ((this.hours() !== 1) ? 's' : '') + '] LT';
            },
            lastDay : function () {
                return '[ayer a la' + ((this.hours() !== 1) ? 's' : '') + '] LT';
            },
            lastWeek : function () {
                return '[el] dddd [pasado a la' + ((this.hours() !== 1) ? 's' : '') + '] LT';
            },
            sameElse : 'L'
        },
        relativeTime : {
            future : "en %s",
            past : "hace %s",
            s : "unos segundos",
            m : "un minuto",
            mm : "%d minutos",
            h : "una hora",
            hh : "%d horas",
            d : "un día",
            dd : "%d días",
            M : "un mes",
            MM : "%d meses",
            y : "un año",
            yy : "%d años"
        },
        ordinal : '%dº',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : estonian (et)
// author : Henry Kehlmann : https://github.com/madhenry

(function (factory) {
    factory(moment);
}(function (moment) {
    function translateSeconds(number, withoutSuffix, key, isFuture) {
        return (isFuture || withoutSuffix) ? 'paari sekundi' : 'paar sekundit';
    }

    moment.lang('et', {
        months        : "jaanuar_veebruar_märts_aprill_mai_juuni_juuli_august_september_oktoober_november_detsember".split("_"),
        monthsShort   : "jaan_veebr_märts_apr_mai_juuni_juuli_aug_sept_okt_nov_dets".split("_"),
        weekdays      : "pühapäev_esmaspäev_teisipäev_kolmapäev_neljapäev_reede_laupäev".split("_"),
        weekdaysShort : "P_E_T_K_N_R_L".split("_"),
        weekdaysMin   : "P_E_T_K_N_R_L".split("_"),
        longDateFormat : {
            LT   : "H:mm",
            L    : "DD.MM.YYYY",
            LL   : "D. MMMM YYYY",
            LLL  : "D. MMMM YYYY LT",
            LLLL : "dddd, D. MMMM YYYY LT"
        },
        calendar : {
            sameDay  : '[Täna,] LT',
            nextDay  : '[Homme,] LT',
            nextWeek : '[Järgmine] dddd LT',
            lastDay  : '[Eile,] LT',
            lastWeek : '[Eelmine] dddd LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "%s pärast",
            past   : "%s tagasi",
            s      : translateSeconds,
            m      : "minut",
            mm     : "%d minutit",
            h      : "tund",
            hh     : "%d tundi",
            d      : "päev",
            dd     : "%d päeva",
            M      : "kuu",
            MM     : "%d kuud",
            y      : "aasta",
            yy     : "%d aastat"
        },
        ordinal : '%d.',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : euskara (eu)
// author : Eneko Illarramendi : https://github.com/eillarra

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('eu', {
        months : "urtarrila_otsaila_martxoa_apirila_maiatza_ekaina_uztaila_abuztua_iraila_urria_azaroa_abendua".split("_"),
        monthsShort : "urt._ots._mar._api._mai._eka._uzt._abu._ira._urr._aza._abe.".split("_"),
        weekdays : "igandea_astelehena_asteartea_asteazkena_osteguna_ostirala_larunbata".split("_"),
        weekdaysShort : "ig._al._ar._az._og._ol._lr.".split("_"),
        weekdaysMin : "ig_al_ar_az_og_ol_lr".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "YYYY-MM-DD",
            LL : "YYYY[ko] MMMM[ren] D[a]",
            LLL : "YYYY[ko] MMMM[ren] D[a] LT",
            LLLL : "dddd, YYYY[ko] MMMM[ren] D[a] LT",
            l : "YYYY-M-D",
            ll : "YYYY[ko] MMM D[a]",
            lll : "YYYY[ko] MMM D[a] LT",
            llll : "ddd, YYYY[ko] MMM D[a] LT"
        },
        calendar : {
            sameDay : '[gaur] LT[etan]',
            nextDay : '[bihar] LT[etan]',
            nextWeek : 'dddd LT[etan]',
            lastDay : '[atzo] LT[etan]',
            lastWeek : '[aurreko] dddd LT[etan]',
            sameElse : 'L'
        },
        relativeTime : {
            future : "%s barru",
            past : "duela %s",
            s : "segundo batzuk",
            m : "minutu bat",
            mm : "%d minutu",
            h : "ordu bat",
            hh : "%d ordu",
            d : "egun bat",
            dd : "%d egun",
            M : "hilabete bat",
            MM : "%d hilabete",
            y : "urte bat",
            yy : "%d urte"
        },
        ordinal : '%d.',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 7  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : Persian Language
// author : Ebrahim Byagowi : https://github.com/ebraminio

(function (factory) {
    factory(moment);
}(function (moment) {
    var symbolMap = {
        '1': '۱',
        '2': '۲',
        '3': '۳',
        '4': '۴',
        '5': '۵',
        '6': '۶',
        '7': '۷',
        '8': '۸',
        '9': '۹',
        '0': '۰'
    }, numberMap = {
        '۱': '1',
        '۲': '2',
        '۳': '3',
        '۴': '4',
        '۵': '5',
        '۶': '6',
        '۷': '7',
        '۸': '8',
        '۹': '9',
        '۰': '0'
    };

    moment.lang('fa', {
        months : 'ژانویه_فوریه_مارس_آوریل_مه_ژوئن_ژوئیه_اوت_سپتامبر_اکتبر_نوامبر_دسامبر'.split('_'),
        monthsShort : 'ژانویه_فوریه_مارس_آوریل_مه_ژوئن_ژوئیه_اوت_سپتامبر_اکتبر_نوامبر_دسامبر'.split('_'),
        weekdays : 'یک\u200cشنبه_دوشنبه_سه\u200cشنبه_چهارشنبه_پنج\u200cشنبه_جمعه_شنبه'.split('_'),
        weekdaysShort : 'یک\u200cشنبه_دوشنبه_سه\u200cشنبه_چهارشنبه_پنج\u200cشنبه_جمعه_شنبه'.split('_'),
        weekdaysMin : 'ی_د_س_چ_پ_ج_ش'.split('_'),
        longDateFormat : {
            LT : 'HH:mm',
            L : 'DD/MM/YYYY',
            LL : 'D MMMM YYYY',
            LLL : 'D MMMM YYYY LT',
            LLLL : 'dddd, D MMMM YYYY LT'
        },
        meridiem : function (hour, minute, isLower) {
            if (hour < 12) {
                return "قبل از ظهر";
            } else {
                return "بعد از ظهر";
            }
        },
        calendar : {
            sameDay : '[امروز ساعت] LT',
            nextDay : '[فردا ساعت] LT',
            nextWeek : 'dddd [ساعت] LT',
            lastDay : '[دیروز ساعت] LT',
            lastWeek : 'dddd [پیش] [ساعت] LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : 'در %s',
            past : '%s پیش',
            s : 'چندین ثانیه',
            m : 'یک دقیقه',
            mm : '%d دقیقه',
            h : 'یک ساعت',
            hh : '%d ساعت',
            d : 'یک روز',
            dd : '%d روز',
            M : 'یک ماه',
            MM : '%d ماه',
            y : 'یک سال',
            yy : '%d سال'
        },
        preparse: function (string) {
            return string.replace(/[۰-۹]/g, function (match) {
                return numberMap[match];
            }).replace(/،/g, ',');
        },
        postformat: function (string) {
            return string.replace(/\d/g, function (match) {
                return symbolMap[match];
            }).replace(/,/g, '،');
        },
        ordinal : '%dم',
        week : {
            dow : 6, // Saturday is the first day of the week.
            doy : 12 // The week that contains Jan 1st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : finnish (fi)
// author : Tarmo Aidantausta : https://github.com/bleadof

(function (factory) {
    factory(moment);
}(function (moment) {
    var numbers_past = 'nolla yksi kaksi kolme neljä viisi kuusi seitsemän kahdeksan yhdeksän'.split(' '),
        numbers_future = ['nolla', 'yhden', 'kahden', 'kolmen', 'neljän', 'viiden', 'kuuden',
                          numbers_past[7], numbers_past[8], numbers_past[9]];

    function translate(number, withoutSuffix, key, isFuture) {
        var result = "";
        switch (key) {
        case 's':
            return isFuture ? 'muutaman sekunnin' : 'muutama sekunti';
        case 'm':
            return isFuture ? 'minuutin' : 'minuutti';
        case 'mm':
            result = isFuture ? 'minuutin' : 'minuuttia';
            break;
        case 'h':
            return isFuture ? 'tunnin' : 'tunti';
        case 'hh':
            result = isFuture ? 'tunnin' : 'tuntia';
            break;
        case 'd':
            return isFuture ? 'päivän' : 'päivä';
        case 'dd':
            result = isFuture ? 'päivän' : 'päivää';
            break;
        case 'M':
            return isFuture ? 'kuukauden' : 'kuukausi';
        case 'MM':
            result = isFuture ? 'kuukauden' : 'kuukautta';
            break;
        case 'y':
            return isFuture ? 'vuoden' : 'vuosi';
        case 'yy':
            result = isFuture ? 'vuoden' : 'vuotta';
            break;
        }
        result = verbal_number(number, isFuture) + " " + result;
        return result;
    }

    function verbal_number(number, isFuture) {
        return number < 10 ? (isFuture ? numbers_future[number] : numbers_past[number]) : number;
    }

    moment.lang('fi', {
        months : "tammikuu_helmikuu_maaliskuu_huhtikuu_toukokuu_kesäkuu_heinäkuu_elokuu_syyskuu_lokakuu_marraskuu_joulukuu".split("_"),
        monthsShort : "tammi_helmi_maalis_huhti_touko_kesä_heinä_elo_syys_loka_marras_joulu".split("_"),
        weekdays : "sunnuntai_maanantai_tiistai_keskiviikko_torstai_perjantai_lauantai".split("_"),
        weekdaysShort : "su_ma_ti_ke_to_pe_la".split("_"),
        weekdaysMin : "su_ma_ti_ke_to_pe_la".split("_"),
        longDateFormat : {
            LT : "HH.mm",
            L : "DD.MM.YYYY",
            LL : "Do MMMM[ta] YYYY",
            LLL : "Do MMMM[ta] YYYY, [klo] LT",
            LLLL : "dddd, Do MMMM[ta] YYYY, [klo] LT",
            l : "D.M.YYYY",
            ll : "Do MMM YYYY",
            lll : "Do MMM YYYY, [klo] LT",
            llll : "ddd, Do MMM YYYY, [klo] LT"
        },
        calendar : {
            sameDay : '[tänään] [klo] LT',
            nextDay : '[huomenna] [klo] LT',
            nextWeek : 'dddd [klo] LT',
            lastDay : '[eilen] [klo] LT',
            lastWeek : '[viime] dddd[na] [klo] LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "%s päästä",
            past : "%s sitten",
            s : translate,
            m : translate,
            mm : translate,
            h : translate,
            hh : translate,
            d : translate,
            dd : translate,
            M : translate,
            MM : translate,
            y : translate,
            yy : translate
        },
        ordinal : "%d.",
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : canadian french (fr-ca)
// author : Jonathan Abourbih : https://github.com/jonbca

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('fr-ca', {
        months : "janvier_février_mars_avril_mai_juin_juillet_août_septembre_octobre_novembre_décembre".split("_"),
        monthsShort : "janv._févr._mars_avr._mai_juin_juil._août_sept._oct._nov._déc.".split("_"),
        weekdays : "dimanche_lundi_mardi_mercredi_jeudi_vendredi_samedi".split("_"),
        weekdaysShort : "dim._lun._mar._mer._jeu._ven._sam.".split("_"),
        weekdaysMin : "Di_Lu_Ma_Me_Je_Ve_Sa".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "YYYY-MM-DD",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd D MMMM YYYY LT"
        },
        calendar : {
            sameDay: "[Aujourd'hui à] LT",
            nextDay: '[Demain à] LT',
            nextWeek: 'dddd [à] LT',
            lastDay: '[Hier à] LT',
            lastWeek: 'dddd [dernier à] LT',
            sameElse: 'L'
        },
        relativeTime : {
            future : "dans %s",
            past : "il y a %s",
            s : "quelques secondes",
            m : "une minute",
            mm : "%d minutes",
            h : "une heure",
            hh : "%d heures",
            d : "un jour",
            dd : "%d jours",
            M : "un mois",
            MM : "%d mois",
            y : "un an",
            yy : "%d ans"
        },
        ordinal : function (number) {
            return number + (number === 1 ? 'er' : '');
        }
    });
}));
// moment.js language configuration
// language : french (fr)
// author : John Fischer : https://github.com/jfroffice

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('fr', {
        months : "janvier_février_mars_avril_mai_juin_juillet_août_septembre_octobre_novembre_décembre".split("_"),
        monthsShort : "janv._févr._mars_avr._mai_juin_juil._août_sept._oct._nov._déc.".split("_"),
        weekdays : "dimanche_lundi_mardi_mercredi_jeudi_vendredi_samedi".split("_"),
        weekdaysShort : "dim._lun._mar._mer._jeu._ven._sam.".split("_"),
        weekdaysMin : "Di_Lu_Ma_Me_Je_Ve_Sa".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd D MMMM YYYY LT"
        },
        calendar : {
            sameDay: "[Aujourd'hui à] LT",
            nextDay: '[Demain à] LT',
            nextWeek: 'dddd [à] LT',
            lastDay: '[Hier à] LT',
            lastWeek: 'dddd [dernier à] LT',
            sameElse: 'L'
        },
        relativeTime : {
            future : "dans %s",
            past : "il y a %s",
            s : "quelques secondes",
            m : "une minute",
            mm : "%d minutes",
            h : "une heure",
            hh : "%d heures",
            d : "un jour",
            dd : "%d jours",
            M : "un mois",
            MM : "%d mois",
            y : "un an",
            yy : "%d ans"
        },
        ordinal : function (number) {
            return number + (number === 1 ? 'er' : '');
        },
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : galician (gl)
// author : Juan G. Hurtado : https://github.com/juanghurtado

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('gl', {
        months : "Xaneiro_Febreiro_Marzo_Abril_Maio_Xuño_Xullo_Agosto_Setembro_Outubro_Novembro_Decembro".split("_"),
        monthsShort : "Xan._Feb._Mar._Abr._Mai._Xuñ._Xul._Ago._Set._Out._Nov._Dec.".split("_"),
        weekdays : "Domingo_Luns_Martes_Mércores_Xoves_Venres_Sábado".split("_"),
        weekdaysShort : "Dom._Lun._Mar._Mér._Xov._Ven._Sáb.".split("_"),
        weekdaysMin : "Do_Lu_Ma_Mé_Xo_Ve_Sá".split("_"),
        longDateFormat : {
            LT : "H:mm",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd D MMMM YYYY LT"
        },
        calendar : {
            sameDay : function () {
                return '[hoxe ' + ((this.hours() !== 1) ? 'ás' : 'á') + '] LT';
            },
            nextDay : function () {
                return '[mañá ' + ((this.hours() !== 1) ? 'ás' : 'á') + '] LT';
            },
            nextWeek : function () {
                return 'dddd [' + ((this.hours() !== 1) ? 'ás' : 'a') + '] LT';
            },
            lastDay : function () {
                return '[onte ' + ((this.hours() !== 1) ? 'á' : 'a') + '] LT';
            },
            lastWeek : function () {
                return '[o] dddd [pasado ' + ((this.hours() !== 1) ? 'ás' : 'a') + '] LT';
            },
            sameElse : 'L'
        },
        relativeTime : {
            future : function (str) {
                if (str === "uns segundos") {
                    return "nuns segundos";
                }
                return "en " + str;
            },
            past : "hai %s",
            s : "uns segundos",
            m : "un minuto",
            mm : "%d minutos",
            h : "unha hora",
            hh : "%d horas",
            d : "un día",
            dd : "%d días",
            M : "un mes",
            MM : "%d meses",
            y : "un ano",
            yy : "%d anos"
        },
        ordinal : '%dº',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 7  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : Hebrew (he)
// author : Tomer Cohen : https://github.com/tomer
// author : Moshe Simantov : https://github.com/DevelopmentIL
// author : Tal Ater : https://github.com/TalAter

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('he', {
        months : "ינואר_פברואר_מרץ_אפריל_מאי_יוני_יולי_אוגוסט_ספטמבר_אוקטובר_נובמבר_דצמבר".split("_"),
        monthsShort : "ינו׳_פבר׳_מרץ_אפר׳_מאי_יוני_יולי_אוג׳_ספט׳_אוק׳_נוב׳_דצמ׳".split("_"),
        weekdays : "ראשון_שני_שלישי_רביעי_חמישי_שישי_שבת".split("_"),
        weekdaysShort : "א׳_ב׳_ג׳_ד׳_ה׳_ו׳_ש׳".split("_"),
        weekdaysMin : "א_ב_ג_ד_ה_ו_ש".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD/MM/YYYY",
            LL : "D [ב]MMMM YYYY",
            LLL : "D [ב]MMMM YYYY LT",
            LLLL : "dddd, D [ב]MMMM YYYY LT",
            l : "D/M/YYYY",
            ll : "D MMM YYYY",
            lll : "D MMM YYYY LT",
            llll : "ddd, D MMM YYYY LT"
        },
        calendar : {
            sameDay : '[היום ב־]LT',
            nextDay : '[מחר ב־]LT',
            nextWeek : 'dddd [בשעה] LT',
            lastDay : '[אתמול ב־]LT',
            lastWeek : '[ביום] dddd [האחרון בשעה] LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "בעוד %s",
            past : "לפני %s",
            s : "מספר שניות",
            m : "דקה",
            mm : "%d דקות",
            h : "שעה",
            hh : function (number) {
                if (number === 2) {
                    return "שעתיים";
                }
                return number + " שעות";
            },
            d : "יום",
            dd : function (number) {
                if (number === 2) {
                    return "יומיים";
                }
                return number + " ימים";
            },
            M : "חודש",
            MM : function (number) {
                if (number === 2) {
                    return "חודשיים";
                }
                return number + " חודשים";
            },
            y : "שנה",
            yy : function (number) {
                if (number === 2) {
                    return "שנתיים";
                }
                return number + " שנים";
            }
        }
    });
}));
// moment.js language configuration
// language : hindi (hi)
// author : Mayank Singhal : https://github.com/mayanksinghal

(function (factory) {
    factory(moment);
}(function (moment) {
    var symbolMap = {
        '1': '१',
        '2': '२',
        '3': '३',
        '4': '४',
        '5': '५',
        '6': '६',
        '7': '७',
        '8': '८',
        '9': '९',
        '0': '०'
    },
    numberMap = {
        '१': '1',
        '२': '2',
        '३': '3',
        '४': '4',
        '५': '5',
        '६': '6',
        '७': '7',
        '८': '8',
        '९': '9',
        '०': '0'
    };

    moment.lang('hi', {
        months : 'जनवरी_फ़रवरी_मार्च_अप्रैल_मई_जून_जुलाई_अगस्त_सितम्बर_अक्टूबर_नवम्बर_दिसम्बर'.split("_"),
        monthsShort : 'जन._फ़र._मार्च_अप्रै._मई_जून_जुल._अग._सित._अक्टू._नव._दिस.'.split("_"),
        weekdays : 'रविवार_सोमवार_मंगलवार_बुधवार_गुरूवार_शुक्रवार_शनिवार'.split("_"),
        weekdaysShort : 'रवि_सोम_मंगल_बुध_गुरू_शुक्र_शनि'.split("_"),
        weekdaysMin : 'र_सो_मं_बु_गु_शु_श'.split("_"),
        longDateFormat : {
            LT : "A h:mm बजे",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY, LT",
            LLLL : "dddd, D MMMM YYYY, LT"
        },
        calendar : {
            sameDay : '[आज] LT',
            nextDay : '[कल] LT',
            nextWeek : 'dddd, LT',
            lastDay : '[कल] LT',
            lastWeek : '[पिछले] dddd, LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "%s में",
            past : "%s पहले",
            s : "कुछ ही क्षण",
            m : "एक मिनट",
            mm : "%d मिनट",
            h : "एक घंटा",
            hh : "%d घंटे",
            d : "एक दिन",
            dd : "%d दिन",
            M : "एक महीने",
            MM : "%d महीने",
            y : "एक वर्ष",
            yy : "%d वर्ष"
        },
        preparse: function (string) {
            return string.replace(/[१२३४५६७८९०]/g, function (match) {
                return numberMap[match];
            });
        },
        postformat: function (string) {
            return string.replace(/\d/g, function (match) {
                return symbolMap[match];
            });
        },
        // Hindi notation for meridiems are quite fuzzy in practice. While there exists
        // a rigid notion of a 'Pahar' it is not used as rigidly in modern Hindi.
        meridiem : function (hour, minute, isLower) {
            if (hour < 4) {
                return "रात";
            } else if (hour < 10) {
                return "सुबह";
            } else if (hour < 17) {
                return "दोपहर";
            } else if (hour < 20) {
                return "शाम";
            } else {
                return "रात";
            }
        },
        week : {
            dow : 0, // Sunday is the first day of the week.
            doy : 6  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : hrvatski (hr)
// author : Bojan Marković : https://github.com/bmarkovic

// based on (sl) translation by Robert Sedovšek

(function (factory) {
    factory(moment);
}(function (moment) {

    function translate(number, withoutSuffix, key) {
        var result = number + " ";
        switch (key) {
        case 'm':
            return withoutSuffix ? 'jedna minuta' : 'jedne minute';
        case 'mm':
            if (number === 1) {
                result += 'minuta';
            } else if (number === 2 || number === 3 || number === 4) {
                result += 'minute';
            } else {
                result += 'minuta';
            }
            return result;
        case 'h':
            return withoutSuffix ? 'jedan sat' : 'jednog sata';
        case 'hh':
            if (number === 1) {
                result += 'sat';
            } else if (number === 2 || number === 3 || number === 4) {
                result += 'sata';
            } else {
                result += 'sati';
            }
            return result;
        case 'dd':
            if (number === 1) {
                result += 'dan';
            } else {
                result += 'dana';
            }
            return result;
        case 'MM':
            if (number === 1) {
                result += 'mjesec';
            } else if (number === 2 || number === 3 || number === 4) {
                result += 'mjeseca';
            } else {
                result += 'mjeseci';
            }
            return result;
        case 'yy':
            if (number === 1) {
                result += 'godina';
            } else if (number === 2 || number === 3 || number === 4) {
                result += 'godine';
            } else {
                result += 'godina';
            }
            return result;
        }
    }

    moment.lang('hr', {
        months : "sječanj_veljača_ožujak_travanj_svibanj_lipanj_srpanj_kolovoz_rujan_listopad_studeni_prosinac".split("_"),
        monthsShort : "sje._vel._ožu._tra._svi._lip._srp._kol._ruj._lis._stu._pro.".split("_"),
        weekdays : "nedjelja_ponedjeljak_utorak_srijeda_četvrtak_petak_subota".split("_"),
        weekdaysShort : "ned._pon._uto._sri._čet._pet._sub.".split("_"),
        weekdaysMin : "ne_po_ut_sr_če_pe_su".split("_"),
        longDateFormat : {
            LT : "H:mm",
            L : "DD. MM. YYYY",
            LL : "D. MMMM YYYY",
            LLL : "D. MMMM YYYY LT",
            LLLL : "dddd, D. MMMM YYYY LT"
        },
        calendar : {
            sameDay  : '[danas u] LT',
            nextDay  : '[sutra u] LT',

            nextWeek : function () {
                switch (this.day()) {
                case 0:
                    return '[u] [nedjelju] [u] LT';
                case 3:
                    return '[u] [srijedu] [u] LT';
                case 6:
                    return '[u] [subotu] [u] LT';
                case 1:
                case 2:
                case 4:
                case 5:
                    return '[u] dddd [u] LT';
                }
            },
            lastDay  : '[jučer u] LT',
            lastWeek : function () {
                switch (this.day()) {
                case 0:
                case 3:
                    return '[prošlu] dddd [u] LT';
                case 6:
                    return '[prošle] [subote] [u] LT';
                case 1:
                case 2:
                case 4:
                case 5:
                    return '[prošli] dddd [u] LT';
                }
            },
            sameElse : 'L'
        },
        relativeTime : {
            future : "za %s",
            past   : "prije %s",
            s      : "par sekundi",
            m      : translate,
            mm     : translate,
            h      : translate,
            hh     : translate,
            d      : "dan",
            dd     : translate,
            M      : "mjesec",
            MM     : translate,
            y      : "godinu",
            yy     : translate
        },
        ordinal : '%d.',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 7  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : hungarian (hu)
// author : Adam Brunner : https://github.com/adambrunner

(function (factory) {
    factory(moment);
}(function (moment) {
    var weekEndings = 'vasárnap hétfőn kedden szerdán csütörtökön pénteken szombaton'.split(' ');

    function translate(number, withoutSuffix, key, isFuture) {
        var num = number,
            suffix;

        switch (key) {
        case 's':
            return (isFuture || withoutSuffix) ? 'néhány másodperc' : 'néhány másodperce';
        case 'm':
            return 'egy' + (isFuture || withoutSuffix ? ' perc' : ' perce');
        case 'mm':
            return num + (isFuture || withoutSuffix ? ' perc' : ' perce');
        case 'h':
            return 'egy' + (isFuture || withoutSuffix ? ' óra' : ' órája');
        case 'hh':
            return num + (isFuture || withoutSuffix ? ' óra' : ' órája');
        case 'd':
            return 'egy' + (isFuture || withoutSuffix ? ' nap' : ' napja');
        case 'dd':
            return num + (isFuture || withoutSuffix ? ' nap' : ' napja');
        case 'M':
            return 'egy' + (isFuture || withoutSuffix ? ' hónap' : ' hónapja');
        case 'MM':
            return num + (isFuture || withoutSuffix ? ' hónap' : ' hónapja');
        case 'y':
            return 'egy' + (isFuture || withoutSuffix ? ' év' : ' éve');
        case 'yy':
            return num + (isFuture || withoutSuffix ? ' év' : ' éve');
        }

        return '';
    }

    function week(isFuture) {
        return (isFuture ? '' : '[múlt] ') + '[' + weekEndings[this.day()] + '] LT[-kor]';
    }

    moment.lang('hu', {
        months : "január_február_március_április_május_június_július_augusztus_szeptember_október_november_december".split("_"),
        monthsShort : "jan_feb_márc_ápr_máj_jún_júl_aug_szept_okt_nov_dec".split("_"),
        weekdays : "vasárnap_hétfő_kedd_szerda_csütörtök_péntek_szombat".split("_"),
        weekdaysShort : "v_h_k_sze_cs_p_szo".split("_"),
        longDateFormat : {
            LT : "H:mm",
            L : "YYYY.MM.DD.",
            LL : "YYYY. MMMM D.",
            LLL : "YYYY. MMMM D., LT",
            LLLL : "YYYY. MMMM D., dddd LT"
        },
        calendar : {
            sameDay : '[ma] LT[-kor]',
            nextDay : '[holnap] LT[-kor]',
            nextWeek : function () {
                return week.call(this, true);
            },
            lastDay : '[tegnap] LT[-kor]',
            lastWeek : function () {
                return week.call(this, false);
            },
            sameElse : 'L'
        },
        relativeTime : {
            future : "%s múlva",
            past : "%s",
            s : translate,
            m : translate,
            mm : translate,
            h : translate,
            hh : translate,
            d : translate,
            dd : translate,
            M : translate,
            MM : translate,
            y : translate,
            yy : translate
        },
        ordinal : '%d.',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 7  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : Bahasa Indonesia (id)
// author : Mohammad Satrio Utomo : https://github.com/tyok
// reference: http://id.wikisource.org/wiki/Pedoman_Umum_Ejaan_Bahasa_Indonesia_yang_Disempurnakan

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('id', {
        months : "Januari_Februari_Maret_April_Mei_Juni_Juli_Agustus_September_Oktober_November_Desember".split("_"),
        monthsShort : "Jan_Feb_Mar_Apr_Mei_Jun_Jul_Ags_Sep_Okt_Nov_Des".split("_"),
        weekdays : "Minggu_Senin_Selasa_Rabu_Kamis_Jumat_Sabtu".split("_"),
        weekdaysShort : "Min_Sen_Sel_Rab_Kam_Jum_Sab".split("_"),
        weekdaysMin : "Mg_Sn_Sl_Rb_Km_Jm_Sb".split("_"),
        longDateFormat : {
            LT : "HH.mm",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY [pukul] LT",
            LLLL : "dddd, D MMMM YYYY [pukul] LT"
        },
        meridiem : function (hours, minutes, isLower) {
            if (hours < 11) {
                return 'pagi';
            } else if (hours < 15) {
                return 'siang';
            } else if (hours < 19) {
                return 'sore';
            } else {
                return 'malam';
            }
        },
        calendar : {
            sameDay : '[Hari ini pukul] LT',
            nextDay : '[Besok pukul] LT',
            nextWeek : 'dddd [pukul] LT',
            lastDay : '[Kemarin pukul] LT',
            lastWeek : 'dddd [lalu pukul] LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "dalam %s",
            past : "%s yang lalu",
            s : "beberapa detik",
            m : "semenit",
            mm : "%d menit",
            h : "sejam",
            hh : "%d jam",
            d : "sehari",
            dd : "%d hari",
            M : "sebulan",
            MM : "%d bulan",
            y : "setahun",
            yy : "%d tahun"
        },
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 7  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : icelandic (is)
// author : Hinrik Örn Sigurðsson : https://github.com/hinrik

(function (factory) {
    factory(moment);
}(function (moment) {
    function plural(n) {
        if (n % 100 === 11) {
            return true;
        } else if (n % 10 === 1) {
            return false;
        }
        return true;
    }

    function translate(number, withoutSuffix, key, isFuture) {
        var result = number + " ";
        switch (key) {
        case 's':
            return withoutSuffix || isFuture ? 'nokkrar sekúndur' : 'nokkrum sekúndum';
        case 'm':
            return withoutSuffix ? 'mínúta' : 'mínútu';
        case 'mm':
            if (plural(number)) {
                return result + (withoutSuffix || isFuture ? 'mínútur' : 'mínútum');
            } else if (withoutSuffix) {
                return result + 'mínúta';
            }
            return result + 'mínútu';
        case 'hh':
            if (plural(number)) {
                return result + (withoutSuffix || isFuture ? 'klukkustundir' : 'klukkustundum');
            }
            return result + 'klukkustund';
        case 'd':
            if (withoutSuffix) {
                return 'dagur';
            }
            return isFuture ? 'dag' : 'degi';
        case 'dd':
            if (plural(number)) {
                if (withoutSuffix) {
                    return result + 'dagar';
                }
                return result + (isFuture ? 'daga' : 'dögum');
            } else if (withoutSuffix) {
                return result + 'dagur';
            }
            return result + (isFuture ? 'dag' : 'degi');
        case 'M':
            if (withoutSuffix) {
                return 'mánuður';
            }
            return isFuture ? 'mánuð' : 'mánuði';
        case 'MM':
            if (plural(number)) {
                if (withoutSuffix) {
                    return result + 'mánuðir';
                }
                return result + (isFuture ? 'mánuði' : 'mánuðum');
            } else if (withoutSuffix) {
                return result + 'mánuður';
            }
            return result + (isFuture ? 'mánuð' : 'mánuði');
        case 'y':
            return withoutSuffix || isFuture ? 'ár' : 'ári';
        case 'yy':
            if (plural(number)) {
                return result + (withoutSuffix || isFuture ? 'ár' : 'árum');
            }
            return result + (withoutSuffix || isFuture ? 'ár' : 'ári');
        }
    }

    moment.lang('is', {
        months : "janúar_febrúar_mars_apríl_maí_júní_júlí_ágúst_september_október_nóvember_desember".split("_"),
        monthsShort : "jan_feb_mar_apr_maí_jún_júl_ágú_sep_okt_nóv_des".split("_"),
        weekdays : "sunnudagur_mánudagur_þriðjudagur_miðvikudagur_fimmtudagur_föstudagur_laugardagur".split("_"),
        weekdaysShort : "sun_mán_þri_mið_fim_fös_lau".split("_"),
        weekdaysMin : "Su_Má_Þr_Mi_Fi_Fö_La".split("_"),
        longDateFormat : {
            LT : "H:mm",
            L : "DD/MM/YYYY",
            LL : "D. MMMM YYYY",
            LLL : "D. MMMM YYYY [kl.] LT",
            LLLL : "dddd, D. MMMM YYYY [kl.] LT"
        },
        calendar : {
            sameDay : '[í dag kl.] LT',
            nextDay : '[á morgun kl.] LT',
            nextWeek : 'dddd [kl.] LT',
            lastDay : '[í gær kl.] LT',
            lastWeek : '[síðasta] dddd [kl.] LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "eftir %s",
            past : "fyrir %s síðan",
            s : translate,
            m : translate,
            mm : translate,
            h : "klukkustund",
            hh : translate,
            d : translate,
            dd : translate,
            M : translate,
            MM : translate,
            y : translate,
            yy : translate
        },
        ordinal : '%d.',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : italian (it)
// author : Lorenzo : https://github.com/aliem
// author: Mattia Larentis: https://github.com/nostalgiaz

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('it', {
        months : "Gennaio_Febbraio_Marzo_Aprile_Maggio_Giugno_Luglio_Agosto_Settembre_Ottobre_Novembre_Dicembre".split("_"),
        monthsShort : "Gen_Feb_Mar_Apr_Mag_Giu_Lug_Ago_Set_Ott_Nov_Dic".split("_"),
        weekdays : "Domenica_Lunedì_Martedì_Mercoledì_Giovedì_Venerdì_Sabato".split("_"),
        weekdaysShort : "Dom_Lun_Mar_Mer_Gio_Ven_Sab".split("_"),
        weekdaysMin : "D_L_Ma_Me_G_V_S".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd, D MMMM YYYY LT"
        },
        calendar : {
            sameDay: '[Oggi alle] LT',
            nextDay: '[Domani alle] LT',
            nextWeek: 'dddd [alle] LT',
            lastDay: '[Ieri alle] LT',
            lastWeek: '[lo scorso] dddd [alle] LT',
            sameElse: 'L'
        },
        relativeTime : {
            future : function (s) {
                return ((/^[0-9].+$/).test(s) ? "tra" : "in") + " " + s;
            },
            past : "%s fa",
            s : "secondi",
            m : "un minuto",
            mm : "%d minuti",
            h : "un'ora",
            hh : "%d ore",
            d : "un giorno",
            dd : "%d giorni",
            M : "un mese",
            MM : "%d mesi",
            y : "un anno",
            yy : "%d anni"
        },
        ordinal: '%dº',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : japanese (ja)
// author : LI Long : https://github.com/baryon

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('ja', {
        months : "1月_2月_3月_4月_5月_6月_7月_8月_9月_10月_11月_12月".split("_"),
        monthsShort : "1月_2月_3月_4月_5月_6月_7月_8月_9月_10月_11月_12月".split("_"),
        weekdays : "日曜日_月曜日_火曜日_水曜日_木曜日_金曜日_土曜日".split("_"),
        weekdaysShort : "日_月_火_水_木_金_土".split("_"),
        weekdaysMin : "日_月_火_水_木_金_土".split("_"),
        longDateFormat : {
            LT : "Ah時m分",
            L : "YYYY/MM/DD",
            LL : "YYYY年M月D日",
            LLL : "YYYY年M月D日LT",
            LLLL : "YYYY年M月D日LT dddd"
        },
        meridiem : function (hour, minute, isLower) {
            if (hour < 12) {
                return "午前";
            } else {
                return "午後";
            }
        },
        calendar : {
            sameDay : '[今日] LT',
            nextDay : '[明日] LT',
            nextWeek : '[来週]dddd LT',
            lastDay : '[昨日] LT',
            lastWeek : '[前週]dddd LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "%s後",
            past : "%s前",
            s : "数秒",
            m : "1分",
            mm : "%d分",
            h : "1時間",
            hh : "%d時間",
            d : "1日",
            dd : "%d日",
            M : "1ヶ月",
            MM : "%dヶ月",
            y : "1年",
            yy : "%d年"
        }
    });
}));
// moment.js language configuration
// language : Georgian (ka)
// author : Irakli Janiashvili : https://github.com/irakli-janiashvili

(function (factory) {
    factory(moment);
}(function (moment) {

    function monthsCaseReplace(m, format) {
        var months = {
            'nominative': 'იანვარი_თებერვალი_მარტი_აპრილი_მაისი_ივნისი_ივლისი_აგვისტო_სექტემბერი_ოქტომბერი_ნოემბერი_დეკემბერი'.split('_'),
            'accusative': 'იანვარს_თებერვალს_მარტს_აპრილის_მაისს_ივნისს_ივლისს_აგვისტს_სექტემბერს_ოქტომბერს_ნოემბერს_დეკემბერს'.split('_')
        },

        nounCase = (/D[oD] *MMMM?/).test(format) ?
            'accusative' :
            'nominative';

        return months[nounCase][m.month()];
    }

    function weekdaysCaseReplace(m, format) {
        var weekdays = {
            'nominative': 'კვირა_ორშაბათი_სამშაბათი_ოთხშაბათი_ხუთშაბათი_პარასკევი_შაბათი'.split('_'),
            'accusative': 'კვირას_ორშაბათს_სამშაბათს_ოთხშაბათს_ხუთშაბათს_პარასკევს_შაბათს'.split('_')
        },

        nounCase = (/(წინა|შემდეგ)/).test(format) ?
            'accusative' :
            'nominative';

        return weekdays[nounCase][m.day()];
    }

    moment.lang('ka', {
        months : monthsCaseReplace,
        monthsShort : "იან_თებ_მარ_აპრ_მაი_ივნ_ივლ_აგვ_სექ_ოქტ_ნოე_დეკ".split("_"),
        weekdays : weekdaysCaseReplace,
        weekdaysShort : "კვი_ორშ_სამ_ოთხ_ხუთ_პარ_შაბ".split("_"),
        weekdaysMin : "კვ_ორ_სა_ოთ_ხუ_პა_შა".split("_"),
        longDateFormat : {
            LT : "h:mm A",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd, D MMMM YYYY LT"
        },
        calendar : {
            sameDay : '[დღეს] LT[-ზე]',
            nextDay : '[ხვალ] LT[-ზე]',
            lastDay : '[გუშინ] LT[-ზე]',
            nextWeek : '[შემდეგ] dddd LT[-ზე]',
            lastWeek : '[წინა] dddd LT-ზე',
            sameElse : 'L'
        },
        relativeTime : {
            future : function (s) {
                return (/(წამი|წუთი|საათი|წელი)/).test(s) ?
                    s.replace(/ი$/, "ში") :
                    s + "ში";
            },
            past : function (s) {
                if ((/(წამი|წუთი|საათი|დღე|თვე)/).test(s)) {
                    return s.replace(/(ი|ე)$/, "ის წინ");
                }
                if ((/წელი/).test(s)) {
                    return s.replace(/წელი$/, "წლის წინ");
                }
            },
            s : "რამდენიმე წამი",
            m : "წუთი",
            mm : "%d წუთი",
            h : "საათი",
            hh : "%d საათი",
            d : "დღე",
            dd : "%d დღე",
            M : "თვე",
            MM : "%d თვე",
            y : "წელი",
            yy : "%d წელი"
        },
        ordinal : function (number) {
            if (number === 0) {
                return number;
            }

            if (number === 1) {
                return number + "-ლი";
            }

            if ((number < 20) || (number <= 100 && (number % 20 === 0)) || (number % 100 === 0)) {
                return "მე-" + number;
            }

            return number + "-ე";
        },
        week : {
            dow : 1,
            doy : 7
        }
    });
}));
// moment.js language configuration
// language : korean (ko)
// author : Kyungwook, Park : https://github.com/kyungw00k

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('ko', {
        months : "1월_2월_3월_4월_5월_6월_7월_8월_9월_10월_11월_12월".split("_"),
        monthsShort : "1월_2월_3월_4월_5월_6월_7월_8월_9월_10월_11월_12월".split("_"),
        weekdays : "일요일_월요일_화요일_수요일_목요일_금요일_토요일".split("_"),
        weekdaysShort : "일_월_화_수_목_금_토".split("_"),
        weekdaysMin : "일_월_화_수_목_금_토".split("_"),
        longDateFormat : {
            LT : "A h시 mm분",
            L : "YYYY.MM.DD",
            LL : "YYYY년 MMMM D일",
            LLL : "YYYY년 MMMM D일 LT",
            LLLL : "YYYY년 MMMM D일 dddd LT"
        },
        meridiem : function (hour, minute, isUpper) {
            return hour < 12 ? '오전' : '오후';
        },
        calendar : {
            sameDay : '오늘 LT',
            nextDay : '내일 LT',
            nextWeek : 'dddd LT',
            lastDay : '어제 LT',
            lastWeek : '지난주 dddd LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "%s 후",
            past : "%s 전",
            s : "몇초",
            ss : "%d초",
            m : "일분",
            mm : "%d분",
            h : "한시간",
            hh : "%d시간",
            d : "하루",
            dd : "%d일",
            M : "한달",
            MM : "%d달",
            y : "일년",
            yy : "%d년"
        },
        ordinal : '%d일'
    });
}));
// moment.js language configuration
// language : latvian (lv)
// author : Kristaps Karlsons : https://github.com/skakri

(function (factory) {
    factory(moment);
}(function (moment) {
    var units = {
        'mm': 'minūti_minūtes_minūte_minūtes',
        'hh': 'stundu_stundas_stunda_stundas',
        'dd': 'dienu_dienas_diena_dienas',
        'MM': 'mēnesi_mēnešus_mēnesis_mēneši',
        'yy': 'gadu_gadus_gads_gadi'
    };

    function format(word, number, withoutSuffix) {
        var forms = word.split('_');
        if (withoutSuffix) {
            return number % 10 === 1 && number !== 11 ? forms[2] : forms[3];
        } else {
            return number % 10 === 1 && number !== 11 ? forms[0] : forms[1];
        }
    }

    function relativeTimeWithPlural(number, withoutSuffix, key) {
        return number + ' ' + format(units[key], number, withoutSuffix);
    }

    moment.lang('lv', {
        months : "janvāris_februāris_marts_aprīlis_maijs_jūnijs_jūlijs_augusts_septembris_oktobris_novembris_decembris".split("_"),
        monthsShort : "jan_feb_mar_apr_mai_jūn_jūl_aug_sep_okt_nov_dec".split("_"),
        weekdays : "svētdiena_pirmdiena_otrdiena_trešdiena_ceturtdiena_piektdiena_sestdiena".split("_"),
        weekdaysShort : "Sv_P_O_T_C_Pk_S".split("_"),
        weekdaysMin : "Sv_P_O_T_C_Pk_S".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD.MM.YYYY",
            LL : "YYYY. [gada] D. MMMM",
            LLL : "YYYY. [gada] D. MMMM, LT",
            LLLL : "YYYY. [gada] D. MMMM, dddd, LT"
        },
        calendar : {
            sameDay : '[Šodien pulksten] LT',
            nextDay : '[Rīt pulksten] LT',
            nextWeek : 'dddd [pulksten] LT',
            lastDay : '[Vakar pulksten] LT',
            lastWeek : '[Pagājušā] dddd [pulksten] LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "%s vēlāk",
            past : "%s agrāk",
            s : "dažas sekundes",
            m : "minūti",
            mm : relativeTimeWithPlural,
            h : "stundu",
            hh : relativeTimeWithPlural,
            d : "dienu",
            dd : relativeTimeWithPlural,
            M : "mēnesi",
            MM : relativeTimeWithPlural,
            y : "gadu",
            yy : relativeTimeWithPlural
        },
        ordinal : '%d.',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : malayalam (ml)
// author : Floyd Pink : https://github.com/floydpink

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('ml', {
        months : 'ജനുവരി_ഫെബ്രുവരി_മാർച്ച്_ഏപ്രിൽ_മേയ്_ജൂൺ_ജൂലൈ_ഓഗസ്റ്റ്_സെപ്റ്റംബർ_ഒക്ടോബർ_നവംബർ_ഡിസംബർ'.split("_"),
        monthsShort : 'ജനു._ഫെബ്രു._മാർ._ഏപ്രി._മേയ്_ജൂൺ_ജൂലൈ._ഓഗ._സെപ്റ്റ._ഒക്ടോ._നവം._ഡിസം.'.split("_"),
        weekdays : 'ഞായറാഴ്ച_തിങ്കളാഴ്ച_ചൊവ്വാഴ്ച_ബുധനാഴ്ച_വ്യാഴാഴ്ച_വെള്ളിയാഴ്ച_ശനിയാഴ്ച'.split("_"),
        weekdaysShort : 'ഞായർ_തിങ്കൾ_ചൊവ്വ_ബുധൻ_വ്യാഴം_വെള്ളി_ശനി'.split("_"),
        weekdaysMin : 'ഞാ_തി_ചൊ_ബു_വ്യാ_വെ_ശ'.split("_"),
        longDateFormat : {
            LT : "A h:mm -നു",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY, LT",
            LLLL : "dddd, D MMMM YYYY, LT"
        },
        calendar : {
            sameDay : '[ഇന്ന്] LT',
            nextDay : '[നാളെ] LT',
            nextWeek : 'dddd, LT',
            lastDay : '[ഇന്നലെ] LT',
            lastWeek : '[കഴിഞ്ഞ] dddd, LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "%s കഴിഞ്ഞ്",
            past : "%s മുൻപ്",
            s : "അൽപ നിമിഷങ്ങൾ",
            m : "ഒരു മിനിറ്റ്",
            mm : "%d മിനിറ്റ്",
            h : "ഒരു മണിക്കൂർ",
            hh : "%d മണിക്കൂർ",
            d : "ഒരു ദിവസം",
            dd : "%d ദിവസം",
            M : "ഒരു മാസം",
            MM : "%d മാസം",
            y : "ഒരു വർഷം",
            yy : "%d വർഷം"
        },
        meridiem : function (hour, minute, isLower) {
            if (hour < 4) {
                return "രാത്രി";
            } else if (hour < 12) {
                return "രാവിലെ";
            } else if (hour < 17) {
                return "ഉച്ച കഴിഞ്ഞ്";
            } else if (hour < 20) {
                return "വൈകുന്നേരം";
            } else {
                return "രാത്രി";
            }
        }
    });
}));
// moment.js language configuration
// language : Marathi (mr)
// author : Harshad Kale : https://github.com/kalehv

(function (factory) {
    factory(moment);
}(function (moment) {
    var symbolMap = {
        '1': '१',
        '2': '२',
        '3': '३',
        '4': '४',
        '5': '५',
        '6': '६',
        '7': '७',
        '8': '८',
        '9': '९',
        '0': '०'
    },
    numberMap = {
        '१': '1',
        '२': '2',
        '३': '3',
        '४': '4',
        '५': '5',
        '६': '6',
        '७': '7',
        '८': '8',
        '९': '9',
        '०': '0'
    };

    moment.lang('mr', {
        months : 'जानेवारी_फेब्रुवारी_मार्च_एप्रिल_मे_जून_जुलै_ऑगस्ट_सप्टेंबर_ऑक्टोबर_नोव्हेंबर_डिसेंबर'.split("_"),
        monthsShort: 'जाने._फेब्रु._मार्च._एप्रि._मे._जून._जुलै._ऑग._सप्टें._ऑक्टो._नोव्हें._डिसें.'.split("_"),
        weekdays : 'रविवार_सोमवार_मंगळवार_बुधवार_गुरूवार_शुक्रवार_शनिवार'.split("_"),
        weekdaysShort : 'रवि_सोम_मंगळ_बुध_गुरू_शुक्र_शनि'.split("_"),
        weekdaysMin : 'र_सो_मं_बु_गु_शु_श'.split("_"),
        longDateFormat : {
            LT : "A h:mm वाजता",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY, LT",
            LLLL : "dddd, D MMMM YYYY, LT"
        },
        calendar : {
            sameDay : '[आज] LT',
            nextDay : '[उद्या] LT',
            nextWeek : 'dddd, LT',
            lastDay : '[काल] LT',
            lastWeek: '[मागील] dddd, LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "%s नंतर",
            past : "%s पूर्वी",
            s : "सेकंद",
            m: "एक मिनिट",
            mm: "%d मिनिटे",
            h : "एक तास",
            hh : "%d तास",
            d : "एक दिवस",
            dd : "%d दिवस",
            M : "एक महिना",
            MM : "%d महिने",
            y : "एक वर्ष",
            yy : "%d वर्षे"
        },
        preparse: function (string) {
            return string.replace(/[१२३४५६७८९०]/g, function (match) {
                return numberMap[match];
            });
        },
        postformat: function (string) {
            return string.replace(/\d/g, function (match) {
                return symbolMap[match];
            });
        },
        meridiem: function (hour, minute, isLower)
        {
            if (hour < 4) {
                return "रात्री";
            } else if (hour < 10) {
                return "सकाळी";
            } else if (hour < 17) {
                return "दुपारी";
            } else if (hour < 20) {
                return "सायंकाळी";
            } else {
                return "रात्री";
            }
        },
        week : {
            dow : 0, // Sunday is the first day of the week.
            doy : 6  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : Bahasa Malaysia (ms-MY)
// author : Weldan Jamili : https://github.com/weldan

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('ms-my', {
        months : "Januari_Februari_Mac_April_Mei_Jun_Julai_Ogos_September_Oktober_November_Disember".split("_"),
        monthsShort : "Jan_Feb_Mac_Apr_Mei_Jun_Jul_Ogs_Sep_Okt_Nov_Dis".split("_"),
        weekdays : "Ahad_Isnin_Selasa_Rabu_Khamis_Jumaat_Sabtu".split("_"),
        weekdaysShort : "Ahd_Isn_Sel_Rab_Kha_Jum_Sab".split("_"),
        weekdaysMin : "Ah_Is_Sl_Rb_Km_Jm_Sb".split("_"),
        longDateFormat : {
            LT : "HH.mm",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY [pukul] LT",
            LLLL : "dddd, D MMMM YYYY [pukul] LT"
        },
        meridiem : function (hours, minutes, isLower) {
            if (hours < 11) {
                return 'pagi';
            } else if (hours < 15) {
                return 'tengahari';
            } else if (hours < 19) {
                return 'petang';
            } else {
                return 'malam';
            }
        },
        calendar : {
            sameDay : '[Hari ini pukul] LT',
            nextDay : '[Esok pukul] LT',
            nextWeek : 'dddd [pukul] LT',
            lastDay : '[Kelmarin pukul] LT',
            lastWeek : 'dddd [lepas pukul] LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "dalam %s",
            past : "%s yang lepas",
            s : "beberapa saat",
            m : "seminit",
            mm : "%d minit",
            h : "sejam",
            hh : "%d jam",
            d : "sehari",
            dd : "%d hari",
            M : "sebulan",
            MM : "%d bulan",
            y : "setahun",
            yy : "%d tahun"
        },
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 7  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : norwegian bokmål (nb)
// authors : Espen Hovlandsdal : https://github.com/rexxars
//           Sigurd Gartmann : https://github.com/sigurdga

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('nb', {
        months : "januar_februar_mars_april_mai_juni_juli_august_september_oktober_november_desember".split("_"),
        monthsShort : "jan._feb._mars_april_mai_juni_juli_aug._sep._okt._nov._des.".split("_"),
        weekdays : "søndag_mandag_tirsdag_onsdag_torsdag_fredag_lørdag".split("_"),
        weekdaysShort : "sø._ma._ti._on._to._fr._lø.".split("_"),
        weekdaysMin : "sø_ma_ti_on_to_fr_lø".split("_"),
        longDateFormat : {
            LT : "H.mm",
            L : "DD.MM.YYYY",
            LL : "D. MMMM YYYY",
            LLL : "D. MMMM YYYY [kl.] LT",
            LLLL : "dddd D. MMMM YYYY [kl.] LT"
        },
        calendar : {
            sameDay: '[i dag kl.] LT',
            nextDay: '[i morgen kl.] LT',
            nextWeek: 'dddd [kl.] LT',
            lastDay: '[i går kl.] LT',
            lastWeek: '[forrige] dddd [kl.] LT',
            sameElse: 'L'
        },
        relativeTime : {
            future : "om %s",
            past : "for %s siden",
            s : "noen sekunder",
            m : "ett minutt",
            mm : "%d minutter",
            h : "en time",
            hh : "%d timer",
            d : "en dag",
            dd : "%d dager",
            M : "en måned",
            MM : "%d måneder",
            y : "ett år",
            yy : "%d år"
        },
        ordinal : '%d.',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : nepali/nepalese
// author : suvash : https://github.com/suvash

(function (factory) {
    factory(moment);
}(function (moment) {
    var symbolMap = {
        '1': '१',
        '2': '२',
        '3': '३',
        '4': '४',
        '5': '५',
        '6': '६',
        '7': '७',
        '8': '८',
        '9': '९',
        '0': '०'
    },
    numberMap = {
        '१': '1',
        '२': '2',
        '३': '3',
        '४': '4',
        '५': '5',
        '६': '6',
        '७': '7',
        '८': '8',
        '९': '9',
        '०': '0'
    };

    moment.lang('ne', {
        months : 'जनवरी_फेब्रुवरी_मार्च_अप्रिल_मई_जुन_जुलाई_अगष्ट_सेप्टेम्बर_अक्टोबर_नोभेम्बर_डिसेम्बर'.split("_"),
        monthsShort : 'जन._फेब्रु._मार्च_अप्रि._मई_जुन_जुलाई._अग._सेप्ट._अक्टो._नोभे._डिसे.'.split("_"),
        weekdays : 'आइतबार_सोमबार_मङ्गलबार_बुधबार_बिहिबार_शुक्रबार_शनिबार'.split("_"),
        weekdaysShort : 'आइत._सोम._मङ्गल._बुध._बिहि._शुक्र._शनि.'.split("_"),
        weekdaysMin : 'आइ._सो._मङ्_बु._बि._शु._श.'.split("_"),
        longDateFormat : {
            LT : "Aको h:mm बजे",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY, LT",
            LLLL : "dddd, D MMMM YYYY, LT"
        },
        preparse: function (string) {
            return string.replace(/[१२३४५६७८९०]/g, function (match) {
                return numberMap[match];
            });
        },
        postformat: function (string) {
            return string.replace(/\d/g, function (match) {
                return symbolMap[match];
            });
        },
        meridiem : function (hour, minute, isLower) {
            if (hour < 3) {
                return "राती";
            } else if (hour < 10) {
                return "बिहान";
            } else if (hour < 15) {
                return "दिउँसो";
            } else if (hour < 18) {
                return "बेलुका";
            } else if (hour < 20) {
                return "साँझ";
            } else {
                return "राती";
            }
        },
        calendar : {
            sameDay : '[आज] LT',
            nextDay : '[भोली] LT',
            nextWeek : '[आउँदो] dddd[,] LT',
            lastDay : '[हिजो] LT',
            lastWeek : '[गएको] dddd[,] LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "%sमा",
            past : "%s अगाडी",
            s : "केही समय",
            m : "एक मिनेट",
            mm : "%d मिनेट",
            h : "एक घण्टा",
            hh : "%d घण्टा",
            d : "एक दिन",
            dd : "%d दिन",
            M : "एक महिना",
            MM : "%d महिना",
            y : "एक बर्ष",
            yy : "%d बर्ष"
        },
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 7  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : dutch (nl)
// author : Joris Röling : https://github.com/jjupiter

(function (factory) {
    factory(moment);
}(function (moment) {
    var monthsShortWithDots = "jan._feb._mrt._apr._mei_jun._jul._aug._sep._okt._nov._dec.".split("_"),
        monthsShortWithoutDots = "jan_feb_mrt_apr_mei_jun_jul_aug_sep_okt_nov_dec".split("_");

    moment.lang('nl', {
        months : "januari_februari_maart_april_mei_juni_juli_augustus_september_oktober_november_december".split("_"),
        monthsShort : function (m, format) {
            if (/-MMM-/.test(format)) {
                return monthsShortWithoutDots[m.month()];
            } else {
                return monthsShortWithDots[m.month()];
            }
        },
        weekdays : "zondag_maandag_dinsdag_woensdag_donderdag_vrijdag_zaterdag".split("_"),
        weekdaysShort : "zo._ma._di._wo._do._vr._za.".split("_"),
        weekdaysMin : "Zo_Ma_Di_Wo_Do_Vr_Za".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD-MM-YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd D MMMM YYYY LT"
        },
        calendar : {
            sameDay: '[Vandaag om] LT',
            nextDay: '[Morgen om] LT',
            nextWeek: 'dddd [om] LT',
            lastDay: '[Gisteren om] LT',
            lastWeek: '[afgelopen] dddd [om] LT',
            sameElse: 'L'
        },
        relativeTime : {
            future : "over %s",
            past : "%s geleden",
            s : "een paar seconden",
            m : "één minuut",
            mm : "%d minuten",
            h : "één uur",
            hh : "%d uur",
            d : "één dag",
            dd : "%d dagen",
            M : "één maand",
            MM : "%d maanden",
            y : "één jaar",
            yy : "%d jaar"
        },
        ordinal : function (number) {
            return number + ((number === 1 || number === 8 || number >= 20) ? 'ste' : 'de');
        },
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : norwegian nynorsk (nn)
// author : https://github.com/mechuwind

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('nn', {
        months : "januar_februar_mars_april_mai_juni_juli_august_september_oktober_november_desember".split("_"),
        monthsShort : "jan_feb_mar_apr_mai_jun_jul_aug_sep_okt_nov_des".split("_"),
        weekdays : "sundag_måndag_tysdag_onsdag_torsdag_fredag_laurdag".split("_"),
        weekdaysShort : "sun_mån_tys_ons_tor_fre_lau".split("_"),
        weekdaysMin : "su_må_ty_on_to_fr_lø".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD.MM.YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd D MMMM YYYY LT"
        },
        calendar : {
            sameDay: '[I dag klokka] LT',
            nextDay: '[I morgon klokka] LT',
            nextWeek: 'dddd [klokka] LT',
            lastDay: '[I går klokka] LT',
            lastWeek: '[Føregående] dddd [klokka] LT',
            sameElse: 'L'
        },
        relativeTime : {
            future : "om %s",
            past : "for %s siden",
            s : "noen sekund",
            m : "ett minutt",
            mm : "%d minutt",
            h : "en time",
            hh : "%d timar",
            d : "en dag",
            dd : "%d dagar",
            M : "en månad",
            MM : "%d månader",
            y : "ett år",
            yy : "%d år"
        },
        ordinal : '%d.',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : polish (pl)
// author : Rafal Hirsz : https://github.com/evoL

(function (factory) {
    factory(moment);
}(function (moment) {
    var monthsNominative = "styczeń_luty_marzec_kwiecień_maj_czerwiec_lipiec_sierpień_wrzesień_październik_listopad_grudzień".split("_"),
        monthsSubjective = "stycznia_lutego_marca_kwietnia_maja_czerwca_lipca_sierpnia_września_października_listopada_grudnia".split("_");

    function plural(n) {
        return (n % 10 < 5) && (n % 10 > 1) && (~~(n / 10) !== 1);
    }

    function translate(number, withoutSuffix, key) {
        var result = number + " ";
        switch (key) {
        case 'm':
            return withoutSuffix ? 'minuta' : 'minutę';
        case 'mm':
            return result + (plural(number) ? 'minuty' : 'minut');
        case 'h':
            return withoutSuffix  ? 'godzina'  : 'godzinę';
        case 'hh':
            return result + (plural(number) ? 'godziny' : 'godzin');
        case 'MM':
            return result + (plural(number) ? 'miesiące' : 'miesięcy');
        case 'yy':
            return result + (plural(number) ? 'lata' : 'lat');
        }
    }

    moment.lang('pl', {
        months : function (momentToFormat, format) {
            if (/D MMMM/.test(format)) {
                return monthsSubjective[momentToFormat.month()];
            } else {
                return monthsNominative[momentToFormat.month()];
            }
        },
        monthsShort : "sty_lut_mar_kwi_maj_cze_lip_sie_wrz_paź_lis_gru".split("_"),
        weekdays : "niedziela_poniedziałek_wtorek_środa_czwartek_piątek_sobota".split("_"),
        weekdaysShort : "nie_pon_wt_śr_czw_pt_sb".split("_"),
        weekdaysMin : "N_Pn_Wt_Śr_Cz_Pt_So".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD.MM.YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd, D MMMM YYYY LT"
        },
        calendar : {
            sameDay: '[Dziś o] LT',
            nextDay: '[Jutro o] LT',
            nextWeek: '[W] dddd [o] LT',
            lastDay: '[Wczoraj o] LT',
            lastWeek: function () {
                switch (this.day()) {
                case 0:
                    return '[W zeszłą niedzielę o] LT';
                case 3:
                    return '[W zeszłą środę o] LT';
                case 6:
                    return '[W zeszłą sobotę o] LT';
                default:
                    return '[W zeszły] dddd [o] LT';
                }
            },
            sameElse: 'L'
        },
        relativeTime : {
            future : "za %s",
            past : "%s temu",
            s : "kilka sekund",
            m : translate,
            mm : translate,
            h : translate,
            hh : translate,
            d : "1 dzień",
            dd : '%d dni',
            M : "miesiąc",
            MM : translate,
            y : "rok",
            yy : translate
        },
        ordinal : '%d.',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : brazilian portuguese (pt-br)
// author : Caio Ribeiro Pereira : https://github.com/caio-ribeiro-pereira

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('pt-br', {
        months : "Janeiro_Fevereiro_Março_Abril_Maio_Junho_Julho_Agosto_Setembro_Outubro_Novembro_Dezembro".split("_"),
        monthsShort : "Jan_Fev_Mar_Abr_Mai_Jun_Jul_Ago_Set_Out_Nov_Dez".split("_"),
        weekdays : "Domingo_Segunda-feira_Terça-feira_Quarta-feira_Quinta-feira_Sexta-feira_Sábado".split("_"),
        weekdaysShort : "Dom_Seg_Ter_Qua_Qui_Sex_Sáb".split("_"),
        weekdaysMin : "Dom_2ª_3ª_4ª_5ª_6ª_Sáb".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD/MM/YYYY",
            LL : "D [de] MMMM [de] YYYY",
            LLL : "D [de] MMMM [de] YYYY LT",
            LLLL : "dddd, D [de] MMMM [de] YYYY LT"
        },
        calendar : {
            sameDay: '[Hoje às] LT',
            nextDay: '[Amanhã às] LT',
            nextWeek: 'dddd [às] LT',
            lastDay: '[Ontem às] LT',
            lastWeek: function () {
                return (this.day() === 0 || this.day() === 6) ?
                    '[Último] dddd [às] LT' : // Saturday + Sunday
                    '[Última] dddd [às] LT'; // Monday - Friday
            },
            sameElse: 'L'
        },
        relativeTime : {
            future : "em %s",
            past : "%s atrás",
            s : "segundos",
            m : "um minuto",
            mm : "%d minutos",
            h : "uma hora",
            hh : "%d horas",
            d : "um dia",
            dd : "%d dias",
            M : "um mês",
            MM : "%d meses",
            y : "um ano",
            yy : "%d anos"
        },
        ordinal : '%dº'
    });
}));
// moment.js language configuration
// language : portuguese (pt)
// author : Jefferson : https://github.com/jalex79

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('pt', {
        months : "Janeiro_Fevereiro_Março_Abril_Maio_Junho_Julho_Agosto_Setembro_Outubro_Novembro_Dezembro".split("_"),
        monthsShort : "Jan_Fev_Mar_Abr_Mai_Jun_Jul_Ago_Set_Out_Nov_Dez".split("_"),
        weekdays : "Domingo_Segunda-feira_Terça-feira_Quarta-feira_Quinta-feira_Sexta-feira_Sábado".split("_"),
        weekdaysShort : "Dom_Seg_Ter_Qua_Qui_Sex_Sáb".split("_"),
        weekdaysMin : "Dom_2ª_3ª_4ª_5ª_6ª_Sáb".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD/MM/YYYY",
            LL : "D [de] MMMM [de] YYYY",
            LLL : "D [de] MMMM [de] YYYY LT",
            LLLL : "dddd, D [de] MMMM [de] YYYY LT"
        },
        calendar : {
            sameDay: '[Hoje às] LT',
            nextDay: '[Amanhã às] LT',
            nextWeek: 'dddd [às] LT',
            lastDay: '[Ontem às] LT',
            lastWeek: function () {
                return (this.day() === 0 || this.day() === 6) ?
                    '[Último] dddd [às] LT' : // Saturday + Sunday
                    '[Última] dddd [às] LT'; // Monday - Friday
            },
            sameElse: 'L'
        },
        relativeTime : {
            future : "em %s",
            past : "%s atrás",
            s : "segundos",
            m : "um minuto",
            mm : "%d minutos",
            h : "uma hora",
            hh : "%d horas",
            d : "um dia",
            dd : "%d dias",
            M : "um mês",
            MM : "%d meses",
            y : "um ano",
            yy : "%d anos"
        },
        ordinal : '%dº',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : romanian (ro)
// author : Vlad Gurdiga : https://github.com/gurdiga
// author : Valentin Agachi : https://github.com/avaly

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('ro', {
        months : "Ianuarie_Februarie_Martie_Aprilie_Mai_Iunie_Iulie_August_Septembrie_Octombrie_Noiembrie_Decembrie".split("_"),
        monthsShort : "Ian_Feb_Mar_Apr_Mai_Iun_Iul_Aug_Sep_Oct_Noi_Dec".split("_"),
        weekdays : "Duminică_Luni_Marţi_Miercuri_Joi_Vineri_Sâmbătă".split("_"),
        weekdaysShort : "Dum_Lun_Mar_Mie_Joi_Vin_Sâm".split("_"),
        weekdaysMin : "Du_Lu_Ma_Mi_Jo_Vi_Sâ".split("_"),
        longDateFormat : {
            LT : "H:mm",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY H:mm",
            LLLL : "dddd, D MMMM YYYY H:mm"
        },
        calendar : {
            sameDay: "[azi la] LT",
            nextDay: '[mâine la] LT',
            nextWeek: 'dddd [la] LT',
            lastDay: '[ieri la] LT',
            lastWeek: '[fosta] dddd [la] LT',
            sameElse: 'L'
        },
        relativeTime : {
            future : "peste %s",
            past : "%s în urmă",
            s : "câteva secunde",
            m : "un minut",
            mm : "%d minute",
            h : "o oră",
            hh : "%d ore",
            d : "o zi",
            dd : "%d zile",
            M : "o lună",
            MM : "%d luni",
            y : "un an",
            yy : "%d ani"
        },
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 7  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : russian (ru)
// author : Viktorminator : https://github.com/Viktorminator
// Author : Menelion Elensúle : https://github.com/Oire

(function (factory) {
    factory(moment);
}(function (moment) {
    function plural(word, num) {
        var forms = word.split('_');
        return num % 10 === 1 && num % 100 !== 11 ? forms[0] : (num % 10 >= 2 && num % 10 <= 4 && (num % 100 < 10 || num % 100 >= 20) ? forms[1] : forms[2]);
    }

    function relativeTimeWithPlural(number, withoutSuffix, key) {
        var format = {
            'mm': 'минута_минуты_минут',
            'hh': 'час_часа_часов',
            'dd': 'день_дня_дней',
            'MM': 'месяц_месяца_месяцев',
            'yy': 'год_года_лет'
        };
        if (key === 'm') {
            return withoutSuffix ? 'минута' : 'минуту';
        }
        else {
            return number + ' ' + plural(format[key], +number);
        }
    }

    function monthsCaseReplace(m, format) {
        var months = {
            'nominative': 'январь_февраль_март_апрель_май_июнь_июль_август_сентябрь_октябрь_ноябрь_декабрь'.split('_'),
            'accusative': 'января_февраля_марта_апреля_мая_июня_июля_августа_сентября_октября_ноября_декабря'.split('_')
        },

        nounCase = (/D[oD]? *MMMM?/).test(format) ?
            'accusative' :
            'nominative';

        return months[nounCase][m.month()];
    }

    function monthsShortCaseReplace(m, format) {
        var monthsShort = {
            'nominative': 'янв_фев_мар_апр_май_июнь_июль_авг_сен_окт_ноя_дек'.split('_'),
            'accusative': 'янв_фев_мар_апр_мая_июня_июля_авг_сен_окт_ноя_дек'.split('_')
        },

        nounCase = (/D[oD]? *MMMM?/).test(format) ?
            'accusative' :
            'nominative';

        return monthsShort[nounCase][m.month()];
    }

    function weekdaysCaseReplace(m, format) {
        var weekdays = {
            'nominative': 'воскресенье_понедельник_вторник_среда_четверг_пятница_суббота'.split('_'),
            'accusative': 'воскресенье_понедельник_вторник_среду_четверг_пятницу_субботу'.split('_')
        },

        nounCase = (/\[ ?[Вв] ?(?:прошлую|следующую)? ?\] ?dddd/).test(format) ?
            'accusative' :
            'nominative';

        return weekdays[nounCase][m.day()];
    }

    moment.lang('ru', {
        months : monthsCaseReplace,
        monthsShort : monthsShortCaseReplace,
        weekdays : weekdaysCaseReplace,
        weekdaysShort : "вск_пнд_втр_срд_чтв_птн_сбт".split("_"),
        weekdaysMin : "вс_пн_вт_ср_чт_пт_сб".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD.MM.YYYY",
            LL : "D MMMM YYYY г.",
            LLL : "D MMMM YYYY г., LT",
            LLLL : "dddd, D MMMM YYYY г., LT"
        },
        calendar : {
            sameDay: '[Сегодня в] LT',
            nextDay: '[Завтра в] LT',
            lastDay: '[Вчера в] LT',
            nextWeek: function () {
                return this.day() === 2 ? '[Во] dddd [в] LT' : '[В] dddd [в] LT';
            },
            lastWeek: function () {
                switch (this.day()) {
                case 0:
                    return '[В прошлое] dddd [в] LT';
                case 1:
                case 2:
                case 4:
                    return '[В прошлый] dddd [в] LT';
                case 3:
                case 5:
                case 6:
                    return '[В прошлую] dddd [в] LT';
                }
            },
            sameElse: 'L'
        },
        relativeTime : {
            future : "через %s",
            past : "%s назад",
            s : "несколько секунд",
            m : relativeTimeWithPlural,
            mm : relativeTimeWithPlural,
            h : "час",
            hh : relativeTimeWithPlural,
            d : "день",
            dd : relativeTimeWithPlural,
            M : "месяц",
            MM : relativeTimeWithPlural,
            y : "год",
            yy : relativeTimeWithPlural
        },

        ordinal: function (number, period) {
            switch (period) {
            case 'M':
            case 'd':
            case 'DDD':
                return number + '-й';
            case 'D':
                return number + '-го';
            case 'w':
            case 'W':
                return number + '-я';
            default:
                return number;
            }
        },

        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 7  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : slovak (sk)
// author : Martin Minka : https://github.com/k2s
// based on work of petrbela : https://github.com/petrbela

(function (factory) {
    factory(moment);
}(function (moment) {
    var months = "január_február_marec_apríl_máj_jún_júl_august_september_október_november_december".split("_"),
        monthsShort = "jan_feb_mar_apr_máj_jún_júl_aug_sep_okt_nov_dec".split("_");

    function plural(n) {
        return (n > 1) && (n < 5);
    }

    function translate(number, withoutSuffix, key, isFuture) {
        var result = number + " ";
        switch (key) {
        case 's':  // a few seconds / in a few seconds / a few seconds ago
            return (withoutSuffix || isFuture) ? 'pár sekúnd' : 'pár sekundami';
        case 'm':  // a minute / in a minute / a minute ago
            return withoutSuffix ? 'minúta' : (isFuture ? 'minútu' : 'minútou');
        case 'mm': // 9 minutes / in 9 minutes / 9 minutes ago
            if (withoutSuffix || isFuture) {
                return result + (plural(number) ? 'minúty' : 'minút');
            } else {
                return result + 'minútami';
            }
            break;
        case 'h':  // an hour / in an hour / an hour ago
            return withoutSuffix ? 'hodina' : (isFuture ? 'hodinu' : 'hodinou');
        case 'hh': // 9 hours / in 9 hours / 9 hours ago
            if (withoutSuffix || isFuture) {
                return result + (plural(number) ? 'hodiny' : 'hodín');
            } else {
                return result + 'hodinami';
            }
            break;
        case 'd':  // a day / in a day / a day ago
            return (withoutSuffix || isFuture) ? 'deň' : 'dňom';
        case 'dd': // 9 days / in 9 days / 9 days ago
            if (withoutSuffix || isFuture) {
                return result + (plural(number) ? 'dni' : 'dní');
            } else {
                return result + 'dňami';
            }
            break;
        case 'M':  // a month / in a month / a month ago
            return (withoutSuffix || isFuture) ? 'mesiac' : 'mesiacom';
        case 'MM': // 9 months / in 9 months / 9 months ago
            if (withoutSuffix || isFuture) {
                return result + (plural(number) ? 'mesiace' : 'mesiacov');
            } else {
                return result + 'mesiacmi';
            }
            break;
        case 'y':  // a year / in a year / a year ago
            return (withoutSuffix || isFuture) ? 'rok' : 'rokom';
        case 'yy': // 9 years / in 9 years / 9 years ago
            if (withoutSuffix || isFuture) {
                return result + (plural(number) ? 'roky' : 'rokov');
            } else {
                return result + 'rokmi';
            }
            break;
        }
    }

    moment.lang('sk', {
        months : months,
        monthsShort : monthsShort,
        monthsParse : (function (months, monthsShort) {
            var i, _monthsParse = [];
            for (i = 0; i < 12; i++) {
                // use custom parser to solve problem with July (červenec)
                _monthsParse[i] = new RegExp('^' + months[i] + '$|^' + monthsShort[i] + '$', 'i');
            }
            return _monthsParse;
        }(months, monthsShort)),
        weekdays : "nedeľa_pondelok_utorok_streda_štvrtok_piatok_sobota".split("_"),
        weekdaysShort : "ne_po_ut_st_št_pi_so".split("_"),
        weekdaysMin : "ne_po_ut_st_št_pi_so".split("_"),
        longDateFormat : {
            LT: "H:mm",
            L : "DD.MM.YYYY",
            LL : "D. MMMM YYYY",
            LLL : "D. MMMM YYYY LT",
            LLLL : "dddd D. MMMM YYYY LT"
        },
        calendar : {
            sameDay: "[dnes o] LT",
            nextDay: '[zajtra o] LT',
            nextWeek: function () {
                switch (this.day()) {
                case 0:
                    return '[v nedeľu o] LT';
                case 1:
                case 2:
                    return '[v] dddd [o] LT';
                case 3:
                    return '[v stredu o] LT';
                case 4:
                    return '[vo štvrtok o] LT';
                case 5:
                    return '[v piatok o] LT';
                case 6:
                    return '[v sobotu o] LT';
                }
            },
            lastDay: '[včera o] LT',
            lastWeek: function () {
                switch (this.day()) {
                case 0:
                    return '[minulú nedeľu o] LT';
                case 1:
                case 2:
                    return '[minulý] dddd [o] LT';
                case 3:
                    return '[minulú stredu o] LT';
                case 4:
                case 5:
                    return '[minulý] dddd [o] LT';
                case 6:
                    return '[minulú sobotu o] LT';
                }
            },
            sameElse: "L"
        },
        relativeTime : {
            future : "za %s",
            past : "pred %s",
            s : translate,
            m : translate,
            mm : translate,
            h : translate,
            hh : translate,
            d : translate,
            dd : translate,
            M : translate,
            MM : translate,
            y : translate,
            yy : translate
        },
        ordinal : '%d.',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : slovenian (sl)
// author : Robert Sedovšek : https://github.com/sedovsek

(function (factory) {
    factory(moment);
}(function (moment) {
    function translate(number, withoutSuffix, key) {
        var result = number + " ";
        switch (key) {
        case 'm':
            return withoutSuffix ? 'ena minuta' : 'eno minuto';
        case 'mm':
            if (number === 1) {
                result += 'minuta';
            } else if (number === 2) {
                result += 'minuti';
            } else if (number === 3 || number === 4) {
                result += 'minute';
            } else {
                result += 'minut';
            }
            return result;
        case 'h':
            return withoutSuffix ? 'ena ura' : 'eno uro';
        case 'hh':
            if (number === 1) {
                result += 'ura';
            } else if (number === 2) {
                result += 'uri';
            } else if (number === 3 || number === 4) {
                result += 'ure';
            } else {
                result += 'ur';
            }
            return result;
        case 'dd':
            if (number === 1) {
                result += 'dan';
            } else {
                result += 'dni';
            }
            return result;
        case 'MM':
            if (number === 1) {
                result += 'mesec';
            } else if (number === 2) {
                result += 'meseca';
            } else if (number === 3 || number === 4) {
                result += 'mesece';
            } else {
                result += 'mesecev';
            }
            return result;
        case 'yy':
            if (number === 1) {
                result += 'leto';
            } else if (number === 2) {
                result += 'leti';
            } else if (number === 3 || number === 4) {
                result += 'leta';
            } else {
                result += 'let';
            }
            return result;
        }
    }

    moment.lang('sl', {
        months : "januar_februar_marec_april_maj_junij_julij_avgust_september_oktober_november_december".split("_"),
        monthsShort : "jan._feb._mar._apr._maj._jun._jul._avg._sep._okt._nov._dec.".split("_"),
        weekdays : "nedelja_ponedeljek_torek_sreda_četrtek_petek_sobota".split("_"),
        weekdaysShort : "ned._pon._tor._sre._čet._pet._sob.".split("_"),
        weekdaysMin : "ne_po_to_sr_če_pe_so".split("_"),
        longDateFormat : {
            LT : "H:mm",
            L : "DD. MM. YYYY",
            LL : "D. MMMM YYYY",
            LLL : "D. MMMM YYYY LT",
            LLLL : "dddd, D. MMMM YYYY LT"
        },
        calendar : {
            sameDay  : '[danes ob] LT',
            nextDay  : '[jutri ob] LT',

            nextWeek : function () {
                switch (this.day()) {
                case 0:
                    return '[v] [nedeljo] [ob] LT';
                case 3:
                    return '[v] [sredo] [ob] LT';
                case 6:
                    return '[v] [soboto] [ob] LT';
                case 1:
                case 2:
                case 4:
                case 5:
                    return '[v] dddd [ob] LT';
                }
            },
            lastDay  : '[včeraj ob] LT',
            lastWeek : function () {
                switch (this.day()) {
                case 0:
                case 3:
                case 6:
                    return '[prejšnja] dddd [ob] LT';
                case 1:
                case 2:
                case 4:
                case 5:
                    return '[prejšnji] dddd [ob] LT';
                }
            },
            sameElse : 'L'
        },
        relativeTime : {
            future : "čez %s",
            past   : "%s nazaj",
            s      : "nekaj sekund",
            m      : translate,
            mm     : translate,
            h      : translate,
            hh     : translate,
            d      : "en dan",
            dd     : translate,
            M      : "en mesec",
            MM     : translate,
            y      : "eno leto",
            yy     : translate
        },
        ordinal : '%d.',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 7  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : Albanian (sq)
// author : Flakërim Ismani : https://github.com/flakerimi
// author: Menelion Elensúle: https://github.com/Oire (tests)

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('sq', {
        months : "Janar_Shkurt_Mars_Prill_Maj_Qershor_Korrik_Gusht_Shtator_Tetor_Nëntor_Dhjetor".split("_"),
        monthsShort : "Jan_Shk_Mar_Pri_Maj_Qer_Kor_Gus_Sht_Tet_Nën_Dhj".split("_"),
        weekdays : "E Diel_E Hënë_E Marte_E Mërkure_E Enjte_E Premte_E Shtunë".split("_"),
        weekdaysShort : "Die_Hën_Mar_Mër_Enj_Pre_Sht".split("_"),
        weekdaysMin : "D_H_Ma_Më_E_P_Sh".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd, D MMMM YYYY LT"
        },
        calendar : {
            sameDay : '[Sot në] LT',
            nextDay : '[Neser në] LT',
            nextWeek : 'dddd [në] LT',
            lastDay : '[Dje në] LT',
            lastWeek : 'dddd [e kaluar në] LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "në %s",
            past : "%s me parë",
            s : "disa seconda",
            m : "një minut",
            mm : "%d minutea",
            h : "një orë",
            hh : "%d orë",
            d : "një ditë",
            dd : "%d ditë",
            M : "një muaj",
            MM : "%d muaj",
            y : "një vit",
            yy : "%d vite"
        },
        ordinal : '%d.',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : swedish (sv)
// author : Jens Alm : https://github.com/ulmus

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('sv', {
        months : "januari_februari_mars_april_maj_juni_juli_augusti_september_oktober_november_december".split("_"),
        monthsShort : "jan_feb_mar_apr_maj_jun_jul_aug_sep_okt_nov_dec".split("_"),
        weekdays : "söndag_måndag_tisdag_onsdag_torsdag_fredag_lördag".split("_"),
        weekdaysShort : "sön_mån_tis_ons_tor_fre_lör".split("_"),
        weekdaysMin : "sö_må_ti_on_to_fr_lö".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "YYYY-MM-DD",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd D MMMM YYYY LT"
        },
        calendar : {
            sameDay: '[Idag] LT',
            nextDay: '[Imorgon] LT',
            lastDay: '[Igår] LT',
            nextWeek: 'dddd LT',
            lastWeek: '[Förra] dddd[en] LT',
            sameElse: 'L'
        },
        relativeTime : {
            future : "om %s",
            past : "för %s sedan",
            s : "några sekunder",
            m : "en minut",
            mm : "%d minuter",
            h : "en timme",
            hh : "%d timmar",
            d : "en dag",
            dd : "%d dagar",
            M : "en månad",
            MM : "%d månader",
            y : "ett år",
            yy : "%d år"
        },
        ordinal : function (number) {
            var b = number % 10,
                output = (~~ (number % 100 / 10) === 1) ? 'e' :
                (b === 1) ? 'a' :
                (b === 2) ? 'a' :
                (b === 3) ? 'e' : 'e';
            return number + output;
        },
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : thai (th)
// author : Kridsada Thanabulpong : https://github.com/sirn

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('th', {
        months : "มกราคม_กุมภาพันธ์_มีนาคม_เมษายน_พฤษภาคม_มิถุนายน_กรกฎาคม_สิงหาคม_กันยายน_ตุลาคม_พฤศจิกายน_ธันวาคม".split("_"),
        monthsShort : "มกรา_กุมภา_มีนา_เมษา_พฤษภา_มิถุนา_กรกฎา_สิงหา_กันยา_ตุลา_พฤศจิกา_ธันวา".split("_"),
        weekdays : "อาทิตย์_จันทร์_อังคาร_พุธ_พฤหัสบดี_ศุกร์_เสาร์".split("_"),
        weekdaysShort : "อาทิตย์_จันทร์_อังคาร_พุธ_พฤหัส_ศุกร์_เสาร์".split("_"), // yes, three characters difference
        weekdaysMin : "อา._จ._อ._พ._พฤ._ศ._ส.".split("_"),
        longDateFormat : {
            LT : "H นาฬิกา m นาที",
            L : "YYYY/MM/DD",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY เวลา LT",
            LLLL : "วันddddที่ D MMMM YYYY เวลา LT"
        },
        meridiem : function (hour, minute, isLower) {
            if (hour < 12) {
                return "ก่อนเที่ยง";
            } else {
                return "หลังเที่ยง";
            }
        },
        calendar : {
            sameDay : '[วันนี้ เวลา] LT',
            nextDay : '[พรุ่งนี้ เวลา] LT',
            nextWeek : 'dddd[หน้า เวลา] LT',
            lastDay : '[เมื่อวานนี้ เวลา] LT',
            lastWeek : '[วัน]dddd[ที่แล้ว เวลา] LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "อีก %s",
            past : "%sที่แล้ว",
            s : "ไม่กี่วินาที",
            m : "1 นาที",
            mm : "%d นาที",
            h : "1 ชั่วโมง",
            hh : "%d ชั่วโมง",
            d : "1 วัน",
            dd : "%d วัน",
            M : "1 เดือน",
            MM : "%d เดือน",
            y : "1 ปี",
            yy : "%d ปี"
        }
    });
}));
// moment.js language configuration
// language : turkish (tr)
// authors : Erhan Gundogan : https://github.com/erhangundogan,
//           Burak Yiğit Kaya: https://github.com/BYK

(function (factory) {
    factory(moment);
}(function (moment) {

    var suffixes = {
        1: "'inci",
        5: "'inci",
        8: "'inci",
        70: "'inci",
        80: "'inci",

        2: "'nci",
        7: "'nci",
        20: "'nci",
        50: "'nci",

        3: "'üncü",
        4: "'üncü",
        100: "'üncü",

        6: "'ncı",

        9: "'uncu",
        10: "'uncu",
        30: "'uncu",

        60: "'ıncı",
        90: "'ıncı"
    };

    moment.lang('tr', {
        months : "Ocak_Şubat_Mart_Nisan_Mayıs_Haziran_Temmuz_Ağustos_Eylül_Ekim_Kasım_Aralık".split("_"),
        monthsShort : "Oca_Şub_Mar_Nis_May_Haz_Tem_Ağu_Eyl_Eki_Kas_Ara".split("_"),
        weekdays : "Pazar_Pazartesi_Salı_Çarşamba_Perşembe_Cuma_Cumartesi".split("_"),
        weekdaysShort : "Paz_Pts_Sal_Çar_Per_Cum_Cts".split("_"),
        weekdaysMin : "Pz_Pt_Sa_Ça_Pe_Cu_Ct".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD.MM.YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd, D MMMM YYYY LT"
        },
        calendar : {
            sameDay : '[bugün saat] LT',
            nextDay : '[yarın saat] LT',
            nextWeek : '[haftaya] dddd [saat] LT',
            lastDay : '[dün] LT',
            lastWeek : '[geçen hafta] dddd [saat] LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "%s sonra",
            past : "%s önce",
            s : "birkaç saniye",
            m : "bir dakika",
            mm : "%d dakika",
            h : "bir saat",
            hh : "%d saat",
            d : "bir gün",
            dd : "%d gün",
            M : "bir ay",
            MM : "%d ay",
            y : "bir yıl",
            yy : "%d yıl"
        },
        ordinal : function (number) {
            if (number === 0) {  // special case for zero
                return number + "'ıncı";
            }
            var a = number % 10,
                b = number % 100 - a,
                c = number >= 100 ? 100 : null;

            return number + (suffixes[a] || suffixes[b] || suffixes[c]);
        },
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 7  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : Morocco Central Atlas Tamaziɣt in Latin (tzm-la)
// author : Abdel Said : https://github.com/abdelsaid

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('tzm-la', {
        months : "innayr_brˤayrˤ_marˤsˤ_ibrir_mayyw_ywnyw_ywlywz_ɣwšt_šwtanbir_ktˤwbrˤ_nwwanbir_dwjnbir".split("_"),
        monthsShort : "innayr_brˤayrˤ_marˤsˤ_ibrir_mayyw_ywnyw_ywlywz_ɣwšt_šwtanbir_ktˤwbrˤ_nwwanbir_dwjnbir".split("_"),
        weekdays : "asamas_aynas_asinas_akras_akwas_asimwas_asiḍyas".split("_"),
        weekdaysShort : "asamas_aynas_asinas_akras_akwas_asimwas_asiḍyas".split("_"),
        weekdaysMin : "asamas_aynas_asinas_akras_akwas_asimwas_asiḍyas".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd D MMMM YYYY LT"
        },
        calendar : {
            sameDay: "[asdkh g] LT",
            nextDay: '[aska g] LT',
            nextWeek: 'dddd [g] LT',
            lastDay: '[assant g] LT',
            lastWeek: 'dddd [g] LT',
            sameElse: 'L'
        },
        relativeTime : {
            future : "dadkh s yan %s",
            past : "yan %s",
            s : "imik",
            m : "minuḍ",
            mm : "%d minuḍ",
            h : "saɛa",
            hh : "%d tassaɛin",
            d : "ass",
            dd : "%d ossan",
            M : "ayowr",
            MM : "%d iyyirn",
            y : "asgas",
            yy : "%d isgasn"
        },
        week : {
            dow : 6, // Saturday is the first day of the week.
            doy : 12  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : Morocco Central Atlas Tamaziɣt (tzm)
// author : Abdel Said : https://github.com/abdelsaid

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('tzm', {
        months : "ⵉⵏⵏⴰⵢⵔ_ⴱⵕⴰⵢⵕ_ⵎⴰⵕⵚ_ⵉⴱⵔⵉⵔ_ⵎⴰⵢⵢⵓ_ⵢⵓⵏⵢⵓ_ⵢⵓⵍⵢⵓⵣ_ⵖⵓⵛⵜ_ⵛⵓⵜⴰⵏⴱⵉⵔ_ⴽⵟⵓⴱⵕ_ⵏⵓⵡⴰⵏⴱⵉⵔ_ⴷⵓⵊⵏⴱⵉⵔ".split("_"),
        monthsShort : "ⵉⵏⵏⴰⵢⵔ_ⴱⵕⴰⵢⵕ_ⵎⴰⵕⵚ_ⵉⴱⵔⵉⵔ_ⵎⴰⵢⵢⵓ_ⵢⵓⵏⵢⵓ_ⵢⵓⵍⵢⵓⵣ_ⵖⵓⵛⵜ_ⵛⵓⵜⴰⵏⴱⵉⵔ_ⴽⵟⵓⴱⵕ_ⵏⵓⵡⴰⵏⴱⵉⵔ_ⴷⵓⵊⵏⴱⵉⵔ".split("_"),
        weekdays : "ⴰⵙⴰⵎⴰⵙ_ⴰⵢⵏⴰⵙ_ⴰⵙⵉⵏⴰⵙ_ⴰⴽⵔⴰⵙ_ⴰⴽⵡⴰⵙ_ⴰⵙⵉⵎⵡⴰⵙ_ⴰⵙⵉⴹⵢⴰⵙ".split("_"),
        weekdaysShort : "ⴰⵙⴰⵎⴰⵙ_ⴰⵢⵏⴰⵙ_ⴰⵙⵉⵏⴰⵙ_ⴰⴽⵔⴰⵙ_ⴰⴽⵡⴰⵙ_ⴰⵙⵉⵎⵡⴰⵙ_ⴰⵙⵉⴹⵢⴰⵙ".split("_"),
        weekdaysMin : "ⴰⵙⴰⵎⴰⵙ_ⴰⵢⵏⴰⵙ_ⴰⵙⵉⵏⴰⵙ_ⴰⴽⵔⴰⵙ_ⴰⴽⵡⴰⵙ_ⴰⵙⵉⵎⵡⴰⵙ_ⴰⵙⵉⴹⵢⴰⵙ".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd D MMMM YYYY LT"
        },
        calendar : {
            sameDay: "[ⴰⵙⴷⵅ ⴴ] LT",
            nextDay: '[ⴰⵙⴽⴰ ⴴ] LT',
            nextWeek: 'dddd [ⴴ] LT',
            lastDay: '[ⴰⵚⴰⵏⵜ ⴴ] LT',
            lastWeek: 'dddd [ⴴ] LT',
            sameElse: 'L'
        },
        relativeTime : {
            future : "ⴷⴰⴷⵅ ⵙ ⵢⴰⵏ %s",
            past : "ⵢⴰⵏ %s",
            s : "ⵉⵎⵉⴽ",
            m : "ⵎⵉⵏⵓⴺ",
            mm : "%d ⵎⵉⵏⵓⴺ",
            h : "ⵙⴰⵄⴰ",
            hh : "%d ⵜⴰⵙⵙⴰⵄⵉⵏ",
            d : "ⴰⵙⵙ",
            dd : "%d oⵙⵙⴰⵏ",
            M : "ⴰⵢoⵓⵔ",
            MM : "%d ⵉⵢⵢⵉⵔⵏ",
            y : "ⴰⵙⴳⴰⵙ",
            yy : "%d ⵉⵙⴳⴰⵙⵏ"
        },
        week : {
            dow : 6, // Saturday is the first day of the week.
            doy : 12  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : ukrainian (uk)
// author : zemlanin : https://github.com/zemlanin
// Author : Menelion Elensúle : https://github.com/Oire

(function (factory) {
    factory(moment);
}(function (moment) {
    function plural(word, num) {
        var forms = word.split('_');
        return num % 10 === 1 && num % 100 !== 11 ? forms[0] : (num % 10 >= 2 && num % 10 <= 4 && (num % 100 < 10 || num % 100 >= 20) ? forms[1] : forms[2]);
    }

    function relativeTimeWithPlural(number, withoutSuffix, key) {
        var format = {
            'mm': 'хвилина_хвилини_хвилин',
            'hh': 'година_години_годин',
            'dd': 'день_дні_днів',
            'MM': 'місяць_місяці_місяців',
            'yy': 'рік_роки_років'
        };
        if (key === 'm') {
            return withoutSuffix ? 'хвилина' : 'хвилину';
        }
        else if (key === 'h') {
            return withoutSuffix ? 'година' : 'годину';
        }
        else {
            return number + ' ' + plural(format[key], +number);
        }
    }

    function monthsCaseReplace(m, format) {
        var months = {
            'nominative': 'січень_лютий_березень_квітень_травень_червень_липень_серпень_вересень_жовтень_листопад_грудень'.split('_'),
            'accusative': 'січня_лютого_березня_квітня_травня_червня_липня_серпня_вересня_жовтня_листопада_грудня'.split('_')
        },

        nounCase = (/D[oD]? *MMMM?/).test(format) ?
            'accusative' :
            'nominative';

        return months[nounCase][m.month()];
    }

    function weekdaysCaseReplace(m, format) {
        var weekdays = {
            'nominative': 'неділя_понеділок_вівторок_середа_четвер_п’ятниця_субота'.split('_'),
            'accusative': 'неділю_понеділок_вівторок_середу_четвер_п’ятницю_суботу'.split('_'),
            'genitive': 'неділі_понеділка_вівторка_середи_четверга_п’ятниці_суботи'.split('_')
        },

        nounCase = (/(\[[ВвУу]\]) ?dddd/).test(format) ?
            'accusative' :
            ((/\[?(?:минулої|наступної)? ?\] ?dddd/).test(format) ?
                'genitive' :
                'nominative');

        return weekdays[nounCase][m.day()];
    }

    function processHoursFunction(str) {
        return function () {
            return str + 'о' + (this.hours() === 11 ? 'б' : '') + '] LT';
        };
    }

    moment.lang('uk', {
        months : monthsCaseReplace,
        monthsShort : "січ_лют_бер_квіт_трав_черв_лип_серп_вер_жовт_лист_груд".split("_"),
        weekdays : weekdaysCaseReplace,
        weekdaysShort : "нед_пон_вів_сер_чет_п’ят_суб".split("_"),
        weekdaysMin : "нд_пн_вт_ср_чт_пт_сб".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD.MM.YYYY",
            LL : "D MMMM YYYY р.",
            LLL : "D MMMM YYYY р., LT",
            LLLL : "dddd, D MMMM YYYY р., LT"
        },
        calendar : {
            sameDay: processHoursFunction('[Сьогодні '),
            nextDay: processHoursFunction('[Завтра '),
            lastDay: processHoursFunction('[Вчора '),
            nextWeek: processHoursFunction('[У] dddd ['),
            lastWeek: function () {
                switch (this.day()) {
                case 0:
                case 3:
                case 5:
                case 6:
                    return processHoursFunction('[Минулої] dddd [').call(this);
                case 1:
                case 2:
                case 4:
                    return processHoursFunction('[Минулого] dddd [').call(this);
                }
            },
            sameElse: 'L'
        },
        relativeTime : {
            future : "за %s",
            past : "%s тому",
            s : "декілька секунд",
            m : relativeTimeWithPlural,
            mm : relativeTimeWithPlural,
            h : "годину",
            hh : relativeTimeWithPlural,
            d : "день",
            dd : relativeTimeWithPlural,
            M : "місяць",
            MM : relativeTimeWithPlural,
            y : "рік",
            yy : relativeTimeWithPlural
        },
        ordinal: function (number, period) {
            switch (period) {
            case 'M':
            case 'd':
            case 'DDD':
            case 'w':
            case 'W':
                return number + '-й';
            case 'D':
                return number + '-го';
            default:
                return number;
            }
        },

        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 7  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));
// moment.js language configuration
// language : chinese
// author : suupic : https://github.com/suupic

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('zh-cn', {
        months : "一月_二月_三月_四月_五月_六月_七月_八月_九月_十月_十一月_十二月".split("_"),
        monthsShort : "1月_2月_3月_4月_5月_6月_7月_8月_9月_10月_11月_12月".split("_"),
        weekdays : "星期日_星期一_星期二_星期三_星期四_星期五_星期六".split("_"),
        weekdaysShort : "周日_周一_周二_周三_周四_周五_周六".split("_"),
        weekdaysMin : "日_一_二_三_四_五_六".split("_"),
        longDateFormat : {
            LT : "Ah点mm",
            L : "YYYY年MMMD日",
            LL : "YYYY年MMMD日",
            LLL : "YYYY年MMMD日LT",
            LLLL : "YYYY年MMMD日ddddLT",
            l : "YYYY年MMMD日",
            ll : "YYYY年MMMD日",
            lll : "YYYY年MMMD日LT",
            llll : "YYYY年MMMD日ddddLT"
        },
        meridiem : function (hour, minute, isLower) {
            if (hour < 9) {
                return "早上";
            } else if (hour < 11 && minute < 30) {
                return "上午";
            } else if (hour < 13 && minute < 30) {
                return "中午";
            } else if (hour < 18) {
                return "下午";
            } else {
                return "晚上";
            }
        },
        calendar : {
            sameDay : '[今天]LT',
            nextDay : '[明天]LT',
            nextWeek : '[下]ddddLT',
            lastDay : '[昨天]LT',
            lastWeek : '[上]ddddLT',
            sameElse : 'L'
        },
        ordinal : function (number, period) {
            switch (period) {
            case "d" :
            case "D" :
            case "DDD" :
                return number + "日";
            case "M" :
                return number + "月";
            case "w" :
            case "W" :
                return number + "周";
            default :
                return number;
            }
        },
        relativeTime : {
            future : "%s内",
            past : "%s前",
            s : "几秒",
            m : "1分钟",
            mm : "%d分钟",
            h : "1小时",
            hh : "%d小时",
            d : "1天",
            dd : "%d天",
            M : "1个月",
            MM : "%d个月",
            y : "1年",
            yy : "%d年"
        }
    });
}));
// moment.js language configuration
// language : traditional chinese (zh-tw)
// author : Ben : https://github.com/ben-lin

(function (factory) {
    factory(moment);
}(function (moment) {
    moment.lang('zh-tw', {
        months : "一月_二月_三月_四月_五月_六月_七月_八月_九月_十月_十一月_十二月".split("_"),
        monthsShort : "1月_2月_3月_4月_5月_6月_7月_8月_9月_10月_11月_12月".split("_"),
        weekdays : "星期日_星期一_星期二_星期三_星期四_星期五_星期六".split("_"),
        weekdaysShort : "週日_週一_週二_週三_週四_週五_週六".split("_"),
        weekdaysMin : "日_一_二_三_四_五_六".split("_"),
        longDateFormat : {
            LT : "Ah點mm",
            L : "YYYY年MMMD日",
            LL : "YYYY年MMMD日",
            LLL : "YYYY年MMMD日LT",
            LLLL : "YYYY年MMMD日ddddLT",
            l : "YYYY年MMMD日",
            ll : "YYYY年MMMD日",
            lll : "YYYY年MMMD日LT",
            llll : "YYYY年MMMD日ddddLT"
        },
        meridiem : function (hour, minute, isLower) {
            if (hour < 9) {
                return "早上";
            } else if (hour < 11 && minute < 30) {
                return "上午";
            } else if (hour < 13 && minute < 30) {
                return "中午";
            } else if (hour < 18) {
                return "下午";
            } else {
                return "晚上";
            }
        },
        calendar : {
            sameDay : '[今天]LT',
            nextDay : '[明天]LT',
            nextWeek : '[下]ddddLT',
            lastDay : '[昨天]LT',
            lastWeek : '[上]ddddLT',
            sameElse : 'L'
        },
        ordinal : function (number, period) {
            switch (period) {
            case "d" :
            case "D" :
            case "DDD" :
                return number + "日";
            case "M" :
                return number + "月";
            case "w" :
            case "W" :
                return number + "週";
            default :
                return number;
            }
        },
        relativeTime : {
            future : "%s內",
            past : "%s前",
            s : "幾秒",
            m : "一分鐘",
            mm : "%d分鐘",
            h : "一小時",
            hh : "%d小時",
            d : "一天",
            dd : "%d天",
            M : "一個月",
            MM : "%d個月",
            y : "一年",
            yy : "%d年"
        }
    });
}));

    moment.lang('en');


    /************************************
        Exposing Moment
    ************************************/


    // CommonJS module is defined
    if (hasModule) {
        module.exports = moment;
    }
    /*global ender:false */
    if (typeof ender === 'undefined') {
        // here, `this` means `window` in the browser, or `global` on the server
        // add `moment` as a global object via a string identifier,
        // for Closure Compiler "advanced" mode
        this['moment'] = moment;
    }
    /*global define:false */
    if (typeof define === "function" && define.amd) {
        define("moment", [], function () {
            return moment;
        });
    }
}).call(this);

// from 'lib/forge.min.js'
(function(e,t){typeof define=="function"&&define.amd?define([],t):e.forge=t()})(this,function(){var e,t,n;return function(r){function v(e,t){return h.call(e,t)}function m(e,t){var n,r,i,s,o,u,a,f,c,h,p,v=t&&t.split("/"),m=l.map,g=m&&m["*"]||{};if(e&&e.charAt(0)===".")if(t){v=v.slice(0,v.length-1),e=e.split("/"),o=e.length-1,l.nodeIdCompat&&d.test(e[o])&&(e[o]=e[o].replace(d,"")),e=v.concat(e);for(c=0;c<e.length;c+=1){p=e[c];if(p===".")e.splice(c,1),c-=1;else if(p===".."){if(c===1&&(e[2]===".."||e[0]===".."))break;c>0&&(e.splice(c-1,2),c-=2)}}e=e.join("/")}else e.indexOf("./")===0&&(e=e.substring(2));if((v||g)&&m){n=e.split("/");for(c=n.length;c>0;c-=1){r=n.slice(0,c).join("/");if(v)for(h=v.length;h>0;h-=1){i=m[v.slice(0,h).join("/")];if(i){i=i[r];if(i){s=i,u=c;break}}}if(s)break;!a&&g&&g[r]&&(a=g[r],f=c)}!s&&a&&(s=a,u=f),s&&(n.splice(0,u,s),e=n.join("/"))}return e}function g(e,t){return function(){return s.apply(r,p.call(arguments,0).concat([e,t]))}}function y(e){return function(t){return m(t,e)}}function b(e){return function(t){a[e]=t}}function w(e){if(v(f,e)){var t=f[e];delete f[e],c[e]=!0,i.apply(r,t)}if(!v(a,e)&&!v(c,e))throw new Error("No "+e);return a[e]}function E(e){var t,n=e?e.indexOf("!"):-1;return n>-1&&(t=e.substring(0,n),e=e.substring(n+1,e.length)),[t,e]}function S(e){return function(){return l&&l.config&&l.config[e]||{}}}var i,s,o,u,a={},f={},l={},c={},h=Object.prototype.hasOwnProperty,p=[].slice,d=/\.js$/;o=function(e,t){var n,r=E(e),i=r[0];return e=r[1],i&&(i=m(i,t),n=w(i)),i?n&&n.normalize?e=n.normalize(e,y(t)):e=m(e,t):(e=m(e,t),r=E(e),i=r[0],e=r[1],i&&(n=w(i))),{f:i?i+"!"+e:e,n:e,pr:i,p:n}},u={require:function(e){return g(e)},exports:function(e){var t=a[e];return typeof t!="undefined"?t:a[e]={}},module:function(e){return{id:e,uri:"",exports:a[e],config:S(e)}}},i=function(e,t,n,i){var s,l,h,p,d,m=[],y=typeof n,E;i=i||e;if(y==="undefined"||y==="function"){t=!t.length&&n.length?["require","exports","module"]:t;for(d=0;d<t.length;d+=1){p=o(t[d],i),l=p.f;if(l==="require")m[d]=u.require(e);else if(l==="exports")m[d]=u.exports(e),E=!0;else if(l==="module")s=m[d]=u.module(e);else if(v(a,l)||v(f,l)||v(c,l))m[d]=w(l);else{if(!p.p)throw new Error(e+" missing "+l);p.p.load(p.n,g(i,!0),b(l),{}),m[d]=a[l]}}h=n?n.apply(a[e],m):undefined;if(e)if(s&&s.exports!==r&&s.exports!==a[e])a[e]=s.exports;else if(h!==r||!E)a[e]=h}else e&&(a[e]=n)},e=t=s=function(e,t,n,a,f){if(typeof e=="string")return u[e]?u[e](t):w(o(e,t).f);if(!e.splice){l=e,l.deps&&s(l.deps,l.callback);if(!t)return;t.splice?(e=t,t=n,n=null):e=r}return t=t||function(){},typeof n=="function"&&(n=a,a=f),a?i(r,e,t,n):setTimeout(function(){i(r,e,t,n)},4),s},s.config=function(e){return s(e)},e._defined=a,n=function(e,t,n){t.splice||(n=t,t=[]),!v(a,e)&&!v(f,e)&&(f[e]=[e,t,n])},n.amd={jQuery:!0}}(),n("node_modules/almond/almond",function(){}),function(){function e(e){function n(e){this.data="",this.read=0;if(typeof e=="string")this.data=e;else if(t.isArrayBuffer(e)||t.isArrayBufferView(e)){var r=new Uint8Array(e);try{this.data=String.fromCharCode.apply(null,r)}catch(i){for(var s=0;s<r.length;++s)this.putByte(r[s])}}else if(e instanceof n||typeof e=="object"&&typeof e.data=="string"&&typeof e.read=="number")this.data=e.data,this.read=e.read;this._constructedStringLength=0}function i(e,n){n=n||{},this.read=n.readOffset||0,this.growSize=n.growSize||1024;var r=t.isArrayBuffer(e),i=t.isArrayBufferView(e);if(r||i){r?this.data=new DataView(e):this.data=new DataView(e.buffer,e.byteOffset,e.byteLength),this.write="writeOffset"in n?n.writeOffset:this.data.byteLength;return}this.data=new DataView(new ArrayBuffer(0)),this.write=0,e!==null&&e!==undefined&&this.putBytes(e),"writeOffset"in n&&(this.write=n.writeOffset)}var t=e.util=e.util||{};(function(){if(typeof process!="undefined"&&process.nextTick){t.nextTick=process.nextTick,typeof setImmediate=="function"?t.setImmediate=setImmediate:t.setImmediate=t.nextTick;return}if(typeof setImmediate=="function"){t.setImmediate=setImmediate,t.nextTick=function(e){return setImmediate(e)};return}t.setImmediate=function(e){setTimeout(e,0)};if(typeof window!="undefined"&&typeof window.postMessage=="function"){var e="forge.setImmediate",n=[];t.setImmediate=function(t){n.push(t),n.length===1&&window.postMessage(e,"*")};function r(t){if(t.source===window&&t.data===e){t.stopPropagation();var r=n.slice();n.length=0,r.forEach(function(e){e()})}}window.addEventListener("message",r,!0)}if(typeof MutationObserver!="undefined"){var i=Date.now(),s=!0,o=document.createElement("div"),n=[];(new MutationObserver(function(){var e=n.slice();n.length=0,e.forEach(function(e){e()})})).observe(o,{attributes:!0});var u=t.setImmediate;t.setImmediate=function(e){Date.now()-i>15?(i=Date.now(),u(e)):(n.push(e),n.length===1&&o.setAttribute("a",s=!s))}}t.nextTick=t.setImmediate})(),t.isArray=Array.isArray||function(e){return Object.prototype.toString.call(e)==="[object Array]"},t.isArrayBuffer=function(e){return typeof ArrayBuffer!="undefined"&&e instanceof ArrayBuffer},t.isArrayBufferView=function(e){return e&&t.isArrayBuffer(e.buffer)&&e.byteLength!==undefined},t.ByteBuffer=n,t.ByteStringBuffer=n;var r=4096;t.ByteStringBuffer.prototype._optimizeConstructedString=function(e){this._constructedStringLength+=e,this._constructedStringLength>r&&(this.data.substr(0,1),this._constructedStringLength=0)},t.ByteStringBuffer.prototype.length=function(){return this.data.length-this.read},t.ByteStringBuffer.prototype.isEmpty=function(){return this.length()<=0},t.ByteStringBuffer.prototype.putByte=function(e){return this.putBytes(String.fromCharCode(e))},t.ByteStringBuffer.prototype.fillWithByte=function(e,t){e=String.fromCharCode(e);var n=this.data;while(t>0)t&1&&(n+=e),t>>>=1,t>0&&(e+=e);return this.data=n,this._optimizeConstructedString(t),this},t.ByteStringBuffer.prototype.putBytes=function(e){return this.data+=e,this._optimizeConstructedString(e.length),this},t.ByteStringBuffer.prototype.putString=function(e){return this.putBytes(t.encodeUtf8(e))},t.ByteStringBuffer.prototype.putInt16=function(e){return this.putBytes(String.fromCharCode(e>>8&255)+String.fromCharCode(e&255))},t.ByteStringBuffer.prototype.putInt24=function(e){return this.putBytes(String.fromCharCode(e>>16&255)+String.fromCharCode(e>>8&255)+String.fromCharCode(e&255))},t.ByteStringBuffer.prototype.putInt32=function(e){return this.putBytes(String.fromCharCode(e>>24&255)+String.fromCharCode(e>>16&255)+String.fromCharCode(e>>8&255)+String.fromCharCode(e&255))},t.ByteStringBuffer.prototype.putInt16Le=function(e){return this.putBytes(String.fromCharCode(e&255)+String.fromCharCode(e>>8&255))},t.ByteStringBuffer.prototype.putInt24Le=function(e){return this.putBytes(String.fromCharCode(e&255)+String.fromCharCode(e>>8&255)+String.fromCharCode(e>>16&255))},t.ByteStringBuffer.prototype.putInt32Le=function(e){return this.putBytes(String.fromCharCode(e&255)+String.fromCharCode(e>>8&255)+String.fromCharCode(e>>16&255)+String.fromCharCode(e>>24&255))},t.ByteStringBuffer.prototype.putInt=function(e,t){var n="";do t-=8,n+=String.fromCharCode(e>>t&255);while(t>0);return this.putBytes(n)},t.ByteStringBuffer.prototype.putSignedInt=function(e,t){return e<0&&(e+=2<<t-1),this.putInt(e,t)},t.ByteStringBuffer.prototype.putBuffer=function(e){return this.putBytes(e.getBytes())},t.ByteStringBuffer.prototype.getByte=function(){return this.data.charCodeAt(this.read++)},t.ByteStringBuffer.prototype.getInt16=function(){var e=this.data.charCodeAt(this.read)<<8^this.data.charCodeAt(this.read+1);return this.read+=2,e},t.ByteStringBuffer.prototype.getInt24=function(){var e=this.data.charCodeAt(this.read)<<16^this.data.charCodeAt(this.read+1)<<8^this.data.charCodeAt(this.read+2);return this.read+=3,e},t.ByteStringBuffer.prototype.getInt32=function(){var e=this.data.charCodeAt(this.read)<<24^this.data.charCodeAt(this.read+1)<<16^this.data.charCodeAt(this.read+2)<<8^this.data.charCodeAt(this.read+3);return this.read+=4,e},t.ByteStringBuffer.prototype.getInt16Le=function(){var e=this.data.charCodeAt(this.read)^this.data.charCodeAt(this.read+1)<<8;return this.read+=2,e},t.ByteStringBuffer.prototype.getInt24Le=function(){var e=this.data.charCodeAt(this.read)^this.data.charCodeAt(this.read+1)<<8^this.data.charCodeAt(this.read+2)<<16;return this.read+=3,e},t.ByteStringBuffer.prototype.getInt32Le=function(){var e=this.data.charCodeAt(this.read)^this.data.charCodeAt(this.read+1)<<8^this.data.charCodeAt(this.read+2)<<16^this.data.charCodeAt(this.read+3)<<24;return this.read+=4,e},t.ByteStringBuffer.prototype.getInt=function(e){var t=0;do t=(t<<8)+this.data.charCodeAt(this.read++),e-=8;while(e>0);return t},t.ByteStringBuffer.prototype.getSignedInt=function(e){var t=this.getInt(e),n=2<<e-2;return t>=n&&(t-=n<<1),t},t.ByteStringBuffer.prototype.getBytes=function(e){var t;return e?(e=Math.min(this.length(),e),t=this.data.slice(this.read,this.read+e),this.read+=e):e===0?t="":(t=this.read===0?this.data:this.data.slice(this.read),this.clear()),t},t.ByteStringBuffer.prototype.bytes=function(e){return typeof e=="undefined"?this.data.slice(this.read):this.data.slice(this.read,this.read+e)},t.ByteStringBuffer.prototype.at=function(e){return this.data.charCodeAt(this.read+e)},t.ByteStringBuffer.prototype.setAt=function(e,t){return this.data=this.data.substr(0,this.read+e)+String.fromCharCode(t)+this.data.substr(this.read+e+1),this},t.ByteStringBuffer.prototype.last=function(){return this.data.charCodeAt(this.data.length-1)},t.ByteStringBuffer.prototype.copy=function(){var e=t.createBuffer(this.data);return e.read=this.read,e},t.ByteStringBuffer.prototype.compact=function(){return this.read>0&&(this.data=this.data.slice(this.read),this.read=0),this},t.ByteStringBuffer.prototype.clear=function(){return this.data="",this.read=0,this},t.ByteStringBuffer.prototype.truncate=function(e){var t=Math.max(0,this.length()-e);return this.data=this.data.substr(this.read,t),this.read=0,this},t.ByteStringBuffer.prototype.toHex=function(){var e="";for(var t=this.read;t<this.data.length;++t){var n=this.data.charCodeAt(t);n<16&&(e+="0"),e+=n.toString(16)}return e},t.ByteStringBuffer.prototype.toString=function(){return t.decodeUtf8(this.bytes())},t.DataBuffer=i,t.DataBuffer.prototype.length=function(){return this.write-this.read},t.DataBuffer.prototype.isEmpty=function(){return this.length()<=0},t.DataBuffer.prototype.accommodate=function(e,t){if(this.length()>=e)return this;t=Math.max(t||this.growSize,e);var n=new Uint8Array(this.data.buffer,this.data.byteOffset,this.data.byteLength),r=new Uint8Array(this.length()+t);return r.set(n),this.data=new DataView(r.buffer),this},t.DataBuffer.prototype.putByte=function(e){return this.accommodate(1),this.data.setUint8(this.write++,e),this},t.DataBuffer.prototype.fillWithByte=function(e,t){this.accommodate(t);for(var n=0;n<t;++n)this.data.setUint8(e);return this},t.DataBuffer.prototype.putBytes=function(e,n){if(t.isArrayBufferView(e)){var r=new Uint8Array(e.buffer,e.byteOffset,e.byteLength),i=r.byteLength-r.byteOffset;this.accommodate(i);var s=new Uint8Array(this.data.buffer,this.write);return s.set(r),this.write+=i,this}if(t.isArrayBuffer(e)){var r=new Uint8Array(e);this.accommodate(r.byteLength);var s=new Uint8Array(this.data.buffer);return s.set(r,this.write),this.write+=r.byteLength,this}if(e instanceof t.DataBuffer||typeof e=="object"&&typeof e.read=="number"&&typeof e.write=="number"&&t.isArrayBufferView(e.data)){var r=new Uint8Array(e.data.byteLength,e.read,e.length());this.accommodate(r.byteLength);var s=new Uint8Array(e.data.byteLength,this.write);return s.set(r),this.write+=r.byteLength,this}e instanceof t.ByteStringBuffer&&(e=e.data,n="binary"),n=n||"binary";if(typeof e=="string"){var o;if(n==="hex")return this.accommodate(Math.ceil(e.length/2)),o=new Uint8Array(this.data.buffer,this.write),this.write+=t.binary.hex.decode(e,o,this.write),this;if(n==="base64")return this.accommodate(Math.ceil(e.length/4)*3),o=new Uint8Array(this.data.buffer,this.write),this.write+=t.binary.base64.decode(e,o,this.write),this;n==="utf8"&&(e=t.encodeUtf8(e),n="binary");if(n==="binary"||n==="raw")return this.accommodate(e.length),o=new Uint8Array(this.data.buffer,this.write),this.write+=t.binary.raw.decode(o),this;if(n==="utf16")return this.accommodate(e.length*2),o=new Uint16Array(this.data.buffer,this.write),this.write+=t.text.utf16.encode(o),this;throw new Error("Invalid encoding: "+n)}throw Error("Invalid parameter: "+e)},t.DataBuffer.prototype.putBuffer=function(e){return this.putBytes(e),e.clear(),this},t.DataBuffer.prototype.putString=function(e){return this.putBytes(e,"utf16")},t.DataBuffer.prototype.putInt16=function(e){return this.accommodate(2),this.data.setInt16(this.write,e),this.write+=2,this},t.DataBuffer.prototype.putInt24=function(e){return this.accommodate(3),this.data.setInt16(this.write,e>>8&65535),this.data.setInt8(this.write,e>>16&255),this.write+=3,this},t.DataBuffer.prototype.putInt32=function(e){return this.accommodate(4),this.data.setInt32(this.write,e),this.write+=4,this},t.DataBuffer.prototype.putInt16Le=function(e){return this.accommodate(2),this.data.setInt16(this.write,e,!0),this.write+=2,this},t.DataBuffer.prototype.putInt24Le=function(e){return this.accommodate(3),this.data.setInt8(this.write,e>>16&255),this.data.setInt16(this.write,e>>8&65535,!0),this.write+=3,this},t.DataBuffer.prototype.putInt32Le=function(e){return this.accommodate(4),this.data.setInt32(this.write,e,!0),this.write+=4,this},t.DataBuffer.prototype.putInt=function(e,t){this.accommodate(t/8);do t-=8,this.data.setInt8(this.write++,e>>t&255);while(t>0);return this},t.DataBuffer.prototype.putSignedInt=function(e,t){return this.accommodate(t/8),e<0&&(e+=2<<t-1),this.putInt(e,t)},t.DataBuffer.prototype.getByte=function(){return this.data.getInt8(this.read++)},t.DataBuffer.prototype.getInt16=function(){var e=this.data.getInt16(this.read);return this.read+=2,e},t.DataBuffer.prototype.getInt24=function(){var e=this.data.getInt16(this.read)<<8^this.data.getInt8(this.read+2);return this.read+=3,e},t.DataBuffer.prototype.getInt32=function(){var e=this.data.getInt32(this.read);return this.read+=4,e},t.DataBuffer.prototype.getInt16Le=function(){var e=this.data.getInt16(this.read,!0);return this.read+=2,e},t.DataBuffer.prototype.getInt24Le=function(){var e=this.data.getInt8(this.read)^this.data.getInt16(this.read+1,!0)<<8;return this.read+=3,e},t.DataBuffer.prototype.getInt32Le=function(){var e=this.data.getInt32(this.read,!0);return this.read+=4,e},t.DataBuffer.prototype.getInt=function(e){var t=0;do t=(t<<8)+this.data.getInt8(this.read++),e-=8;while(e>0);return t},t.DataBuffer.prototype.getSignedInt=function(e){var t=this.getInt(e),n=2<<e-2;return t>=n&&(t-=n<<1),t},t.DataBuffer.prototype.getBytes=function(e){var t;return e?(e=Math.min(this.length(),e),t=this.data.slice(this.read,this.read+e),this.read+=e):e===0?t="":(t=this.read===0?this.data:this.data.slice(this.read),this.clear()),t},t.DataBuffer.prototype.bytes=function(e){return typeof e=="undefined"?this.data.slice(this.read):this.data.slice(this.read,this.read+e)},t.DataBuffer.prototype.at=function(e){return this.data.getUint8(this.read+e)},t.DataBuffer.prototype.setAt=function(e,t){return this.data.setUint8(e,t),this},t.DataBuffer.prototype.last=function(){return this.data.getUint8(this.write-1)},t.DataBuffer.prototype.copy=function(){return new t.DataBuffer(this)},t.DataBuffer.prototype.compact=function(){if(this.read>0){var e=new Uint8Array(this.data.buffer,this.read),t=new Uint8Array(e.byteLength);t.set(e),this.data=new DataView(t),this.write-=this.read,this.read=0}return this},t.DataBuffer.prototype.clear=function(){return this.data=new DataView(new ArrayBuffer(0)),this.read=this.write=0,this},t.DataBuffer.prototype.truncate=function(e){return this.write=Math.max(0,this.length()-e),this.read=Math.min(this.read,this.write),this},t.DataBuffer.prototype.toHex=function(){var e="";for(var t=this.read;t<this.data.byteLength;++t){var n=this.data.getUint8(t);n<16&&(e+="0"),e+=n.toString(16)}return e},t.DataBuffer.prototype.toString=function(e){var n=new Uint8Array(this.data,this.read,this.length());e=e||"utf8";if(e==="binary"||e==="raw")return t.binary.raw.encode(n);if(e==="hex")return t.binary.hex.encode(n);if(e==="base64")return t.binary.base64.encode(n);if(e==="utf8")return t.text.utf8.decode(n);if(e==="utf16")return t.text.utf16.decode(n);throw new Error("Invalid encoding: "+e)},t.createBuffer=function(e,n){return n=n||"raw",e!==undefined&&n==="utf8"&&(e=t.encodeUtf8(e)),new t.ByteBuffer(e)},t.fillString=function(e,t){var n="";while(t>0)t&1&&(n+=e),t>>>=1,t>0&&(e+=e);return n},t.xorBytes=function(e,t,n){var r="",i="",s="",o=0,u=0;for(;n>0;--n,++o)i=e.charCodeAt(o)^t.charCodeAt(o),u>=10&&(r+=s,s="",u=0),s+=String.fromCharCode(i),++u;return r+=s,r},t.hexToBytes=function(e){var t="",n=0;e.length&!0&&(n=1,t+=String.fromCharCode(parseInt(e[0],16)));for(;n<e.length;n+=2)t+=String.fromCharCode(parseInt(e.substr(n,2),16));return t},t.bytesToHex=function(e){return t.createBuffer(e).toHex()},t.int32ToBytes=function(e){return String.fromCharCode(e>>24&255)+String.fromCharCode(e>>16&255)+String.fromCharCode(e>>8&255)+String.fromCharCode(e&255)};var s="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",o=[62,-1,-1,-1,63,52,53,54,55,56,57,58,59,60,61,-1,-1,-1,64,-1,-1,-1,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,-1,-1,-1,-1,-1,-1,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51];t.encode64=function(e,t){var n="",r="",i,o,u,a=0;while(a<e.length)i=e.charCodeAt(a++),o=e.charCodeAt(a++),u=e.charCodeAt(a++),n+=s.charAt(i>>2),n+=s.charAt((i&3)<<4|o>>4),isNaN(o)?n+="==":(n+=s.charAt((o&15)<<2|u>>6),n+=isNaN(u)?"=":s.charAt(u&63)),t&&n.length>t&&(r+=n.substr(0,t)+"\r\n",n=n.substr(t));return r+=n,r},t.decode64=function(e){e=e.replace(/[^A-Za-z0-9\+\/\=]/g,"");var t="",n,r,i,s,u=0;while(u<e.length)n=o[e.charCodeAt(u++)-43],r=o[e.charCodeAt(u++)-43],i=o[e.charCodeAt(u++)-43],s=o[e.charCodeAt(u++)-43],t+=String.fromCharCode(n<<2|r>>4),i!==64&&(t+=String.fromCharCode((r&15)<<4|i>>2),s!==64&&(t+=String.fromCharCode((i&3)<<6|s)));return t},t.encodeUtf8=function(e){return unescape(encodeURIComponent(e))},t.decodeUtf8=function(e){return decodeURIComponent(escape(e))},t.binary={raw:{},hex:{},base64:{}},t.binary.raw.encode=function(e){return String.fromCharCode.apply(null,e)},t.binary.raw.decode=function(e,t,n){var r=t;r||(r=new Uint8Array(e.length)),n=n||0;var i=n;for(var s=0;s<e.length;++s)r[i++]=e.charCodeAt(s);return t?i-n:r},t.binary.hex.encode=t.bytesToHex,t.binary.hex.decode=function(e,t,n){var r=t;r||(r=new Uint8Array(Math.ceil(e.length/2))),n=n||0;var i=0,s=n;e.length&1&&(i=1,r[s++]=parseInt(e[0],16));for(;i<e.length;i+=2)r[s++]=parseInt(e.substr(i,2),16);return t?s-n:r},t.binary.base64.encode=function(e,t){var n="",r="",i,o,u,a=0;while(a<e.byteLength)i=e[a++],o=e[a++],u=e[a++],n+=s.charAt(i>>2),n+=s.charAt((i&3)<<4|o>>4),isNaN(o)?n+="==":(n+=s.charAt((o&15)<<2|u>>6),n+=isNaN(u)?"=":s.charAt(u&63)),t&&n.length>t&&(r+=n.substr(0,t)+"\r\n",n=n.substr(t));return r+=n,r},t.binary.base64.decode=function(e,t,n){var r=t;r||(r=new Uint8Array(Math.ceil(e.length/4)*3)),e=e.replace(/[^A-Za-z0-9\+\/\=]/g,""),n=n||0;var i,s,u,a,f=0,l=n;while(f<e.length)i=o[e.charCodeAt(f++)-43],s=o[e.charCodeAt(f++)-43],u=o[e.charCodeAt(f++)-43],a=o[e.charCodeAt(f++)-43],r[l++]=i<<2|s>>4,u!==64&&(r[l++]=(s&15)<<4|u>>2,a!==64&&(r[l++]=(u&3)<<6|a));return t?l-n:r.subarray(0,l)},t.text={utf8:{},utf16:{}},t.text.utf8.encode=function(e,n,r){e=t.encodeUtf8(e);var i=n;i||(i=new Uint8Array(e.length)),r=r||0;var s=r;for(var o=0;o<e.length;++o)i[s++]=e.charCodeAt(o);return n?s-r:i},t.text.utf8.decode=function(e){return t.decodeUtf8(String.fromCharCode.apply(null,e))},t.text.utf16.encode=function(e,t,n){var r=t;r||(r=new Uint8Array(e.length));var i=new Uint16Array(r);n=n||0;var s=n,o=n;for(var u=0;u<e.length;++u)i[o++]=e.charCodeAt(u),s+=2;return t?s-n:r},t.text.utf16.decode=function(e){return String.fromCharCode.apply(null,new Uint16Array(e))},t.deflate=function(e,n,r){n=t.decode64(e.deflate(t.encode64(n)).rval);if(r){var i=2,s=n.charCodeAt(1);s&32&&(i=6),n=n.substring(i,n.length-4)}return n},t.inflate=function(e,n,r){var i=e.inflate(t.encode64(n)).rval;return i===null?null:t.decode64(i)};var u=function(e,n,r){if(!e)throw new Error("WebStorage not available.");var i;r===null?i=e.removeItem(n):(r=t.encode64(JSON.stringify(r)),i=e.setItem(n,r));if(typeof i!="undefined"&&i.rval!==!0){var s=new Error(i.error.message);throw s.id=i.error.id,s.name=i.error.name,s}},a=function(e,n){if(!e)throw new Error("WebStorage not available.");var r=e.getItem(n);if(e.init)if(r.rval===null){if(r.error){var i=new Error(r.error.message);throw i.id=r.error.id,i.name=r.error.name,i}r=null}else r=r.rval;return r!==null&&(r=JSON.parse(t.decode64(r))),r},f=function(e,t,n,r){var i=a(e,t);i===null&&(i={}),i[n]=r,u(e,t,i)},l=function(e,t,n){var r=a(e,t);return r!==null&&(r=n in r?r[n]:null),r},c=function(e,t,n){var r=a(e,t);if(r!==null&&n in r){delete r[n];var i=!0;for(var s in r){i=!1;break}i&&(r=null),u(e,t,r)}},h=function(e,t){u(e,t,null)},p=function(e,t,n){var r=null;typeof n=="undefined"&&(n=["web","flash"]);var i,s=!1,o=null;for(var u in n){i=n[u];try{if(i==="flash"||i==="both"){if(t[0]===null)throw new Error("Flash local storage not available.");r=e.apply(this,t),s=i==="flash"}if(i==="web"||i==="both")t[0]=localStorage,r=e.apply(this,t),s=!0}catch(a){o=a}if(s)break}if(!s)throw o;return r};t.setItem=function(e,t,n,r,i){p(f,arguments,i)},t.getItem=function(e,t,n,r){return p(l,arguments,r)},t.removeItem=function(e,t,n,r){p(c,arguments,r)},t.clearItems=function(e,t,n){p(h,arguments,n)},t.parseUrl=function(e){var t=/^(https?):\/\/([^:&^\/]*):?(\d*)(.*)$/g;t.lastIndex=0;var n=t.exec(e),r=n===null?null:{full:e,scheme:n[1],host:n[2],port:n[3],path:n[4]};return r&&(r.fullHost=r.host,r.port?r.port!==80&&r.scheme==="http"?r.fullHost+=":"+r.port:r.port!==443&&r.scheme==="https"&&(r.fullHost+=":"+r.port):r.scheme==="http"?r.port=80:r.scheme==="https"&&(r.port=443),r.full=r.scheme+"://"+r.fullHost),r};var d=null;t.getQueryVariables=function(e){var t=function(e){var t={},n=e.split("&");for(var r=0;r<n.length;r++){var i=n[r].indexOf("="),s,o;i>0?(s=n[r].substring(0,i),o=n[r].substring(i+1)):(s=n[r],o=null),s in t||(t[s]=[]),!(s in Object.prototype)&&o!==null&&t[s].push(unescape(o))}return t},n;return typeof e=="undefined"?(d===null&&(typeof window!="undefined"&&window.location&&window.location.search?d=t(window.location.search.substring(1)):d={}),n=d):n=t(e),n},t.parseFragment=function(e){var n=e,r="",i=e.indexOf("?");i>0&&(n=e.substring(0,i),r=e.substring(i+1));var s=n.split("/");s.length>0&&s[0]===""&&s.shift();var o=r===""?{}:t.getQueryVariables(r);return{pathString:n,queryString:r,path:s,query:o}},t.makeRequest=function(e){var n=t.parseFragment(e),r={path:n.pathString,query:n.queryString,getPath:function(e){return typeof e=="undefined"?n.path:n.path[e]},getQuery:function(e,t){var r;return typeof e=="undefined"?r=n.query:(r=n.query[e],r&&typeof t!="undefined"&&(r=r[t])),r},getQueryLast:function(e,t){var n,i=r.getQuery(e);return i?n=i[i.length-1]:n=t,n}};return r},t.makeLink=function(e,t,n){e=jQuery.isArray(e)?e.join("/"):e;var r=jQuery.param(t||{});return n=n||"",e+(r.length>0?"?"+r:"")+(n.length>0?"#"+n:"")},t.setPath=function(e,t,n){if(typeof e=="object"&&e!==null){var r=0,i=t.length;while(r<i){var s=t[r++];if(r==i)e[s]=n;else{var o=s in e;if(!o||o&&typeof e[s]!="object"||o&&e[s]===null)e[s]={};e=e[s]}}}},t.getPath=function(e,t,n){var r=0,i=t.length,s=!0;while(s&&r<i&&typeof e=="object"&&e!==null){var o=t[r++];s=o in e,s&&(e=e[o])}return s?e:n},t.deletePath=function(e,t){if(typeof e=="object"&&e!==null){var n=0,r=t.length;while(n<r){var i=t[n++];if(n==r)delete e[i];else{if(!(i in e&&typeof e[i]=="object"&&e[i]!==null))break;e=e[i]}}}},t.isEmpty=function(e){for(var t in e)if(e.hasOwnProperty(t))return!1;return!0},t.format=function(e){var t=/%./g,n,r,i=0,s=[],o=0;while(n=t.exec(e)){r=e.substring(o,t.lastIndex-2),r.length>0&&s.push(r),o=t.lastIndex;var u=n[0][1];switch(u){case"s":case"o":i<arguments.length?s.push(arguments[i++ +1]):s.push("<?>");break;case"%":s.push("%");break;default:s.push("<%"+u+"?>")}}return s.push(e.substring(o)),s.join("")},t.formatNumber=function(e,t,n,r){var i=e,s=isNaN(t=Math.abs(t))?2:t,o=n===undefined?",":n,u=r===undefined?".":r,a=i<0?"-":"",f=parseInt(i=Math.abs(+i||0).toFixed(s),10)+"",l=f.length>3?f.length%3:0;return a+(l?f.substr(0,l)+u:"")+f.substr(l).replace(/(\d{3})(?=\d)/g,"$1"+u)+(s?o+Math.abs(i-f).toFixed(s).slice(2):"")},t.formatSize=function(e){return e>=1073741824?e=t.formatNumber(e/1073741824,2,".","")+" GiB":e>=1048576?e=t.formatNumber(e/1048576,2,".","")+" MiB":e>=1024?e=t.formatNumber(e/1024,0)+" KiB":e=t.formatNumber(e,0)+" bytes",e},t.bytesFromIP=function(e){return e.indexOf(".")!==-1?t.bytesFromIPv4(e):e.indexOf(":")!==-1?t.bytesFromIPv6(e):null},t.bytesFromIPv4=function(e){e=e.split(".");if(e.length!==4)return null;var n=t.createBuffer();for(var r=0;r<e.length;++r){var i=parseInt(e[r],10);if(isNaN(i))return null;n.putByte(i)}return n.getBytes()},t.bytesFromIPv6=function(e){var n=0;e=e.split(":").filter(function(e){return e.length===0&&++n,!0});var r=(8-e.length+n)*2,i=t.createBuffer();for(var s=0;s<8;++s){if(!e[s]||e[s].length===0){i.fillWithByte(0,r),r=0;continue}var o=t.hexToBytes(e[s]);o.length<2&&i.putByte(0),i.putBytes(o)}return i.getBytes()},t.bytesToIP=function(e){return e.length===4?t.bytesToIPv4(e):e.length===16?t.bytesToIPv6(e):null},t.bytesToIPv4=function(e){if(e.length!==4)return null;var t=[];for(var n=0;n<e.length;++n)t.push(e.charCodeAt(n));return t.join(".")},t.bytesToIPv6=function(e){if(e.length!==16)return null;var n=[],r=[],i=0;for(var s=0;s<e.length;s+=2){var o=t.bytesToHex(e[s]+e[s+1]);while(o[0]==="0"&&o!=="0")o=o.substr(1);if(o==="0"){var u=r[r.length-1],a=n.length;!u||a!==u.end+1?r.push({start:a,end:a}):(u.end=a,u.end-u.start>r[i].end-r[i].start&&(i=r.length-1))}n.push(o)}if(r.length>0){var f=r[i];f.end-f.start>0&&(n.splice(f.start,f.end-f.start+1,""),f.start===0&&n.unshift(""),f.end===7&&n.push(""))}return n.join(":")},t.estimateCores=function(e,n){function i(e,u,a){if(u===0){var f=Math.floor(e.reduce(function(e,t){return e+t},0)/e.length);return t.cores=Math.max(1,f),URL.revokeObjectURL(r),n(null,t.cores)}s(a,function(t,n){e.push(o(a,n)),i(e,u-1,a)})}function s(e,t){var n=[],i=[];for(var s=0;s<e;++s){var o=new Worker(r);o.addEventListener("message",function(r){i.push(r.data);if(i.length===e){for(var s=0;s<e;++s)n[s].terminate();t(null,i)}}),n.push(o)}for(var s=0;s<e;++s)n[s].postMessage(s)}function o(e,t){var n=[];for(var r=0;r<e;++r){var i=t[r],s=n[r]=[];for(var o=0;o<e;++o){if(r===o)continue;var u=t[o];(i.st>u.st&&i.st<u.et||u.st>i.st&&u.st<i.et)&&s.push(o)}}return n.reduce(function(e,t){return Math.max(e,t.length)},0)}typeof e=="function"&&(n=e,e={}),e=e||{};if("cores"in t&&!e.update)return n(null,t.cores);if(typeof navigator!="undefined"&&"hardwareConcurrency"in navigator&&navigator.hardwareConcurrency>0)return t.cores=navigator.hardwareConcurrency,n(null,t.cores);if(typeof Worker=="undefined")return t.cores=1,n(null,t.cores);if(typeof Blob=="undefined")return t.cores=2,n(null,t.cores);var r=URL.createObjectURL(new Blob(["(",function(){self.addEventListener("message",function(e){var t=Date.now(),n=t+4;while(Date.now()<n);self.postMessage({st:t,et:n})})}.toString(),")()"],{type:"application/javascript"}));i([],5,16)}}var r="util";if(typeof n!="function"){if(typeof module!="object"||!module.exports)return typeof forge=="undefined"&&(forge={}),e(forge);var i=!0;n=function(e,n){n(t,module)}}var s,o=function(t,n){n.exports=function(n){var i=s.map(function(e){return t(e)}).concat(e);n=n||{},n.defined=n.defined||{};if(n.defined[r])return n[r];n.defined[r]=!0;for(var o=0;o<i.length;++o)i[o](n);return n[r]}},u=n;n=function(e,t){return s=typeof e=="string"?t.slice(2):e.slice(2),i?(delete n,u.apply(null,Array.prototype.slice.call(arguments,0))):(n=u,n.apply(null,Array.prototype.slice.call(arguments,0)))},n("js/util",["require","module"],function(){o.apply(null,Array.prototype.slice.call(arguments,0))})}(),function(){function e(e){e.cipher=e.cipher||{},e.cipher.algorithms=e.cipher.algorithms||{},e.cipher.createCipher=function(t,n){var r=t;typeof r=="string"&&(r=e.cipher.getAlgorithm(r),r&&(r=r()));if(!r)throw new Error("Unsupported algorithm: "+t);return new e.cipher.BlockCipher({algorithm:r,key:n,decrypt:!1})},e.cipher.createDecipher=function(t,n){var r=t;typeof r=="string"&&(r=e.cipher.getAlgorithm(r),r&&(r=r()));if(!r)throw new Error("Unsupported algorithm: "+t);return new e.cipher.BlockCipher({algorithm:r,key:n,decrypt:!0})},e.cipher.registerAlgorithm=function(t,n){t=t.toUpperCase(),e.cipher.algorithms[t]=n},e.cipher.getAlgorithm=function(t){return t=t.toUpperCase(),t in e.cipher.algorithms?e.cipher.algorithms[t]:null};var t=e.cipher.BlockCipher=function(e){this.algorithm=e.algorithm,this.mode=this.algorithm.mode,this.blockSize=this.mode.blockSize,this._finish=!1,this._input=null,this.output=null,this._op=e.decrypt?this.mode.decrypt:this.mode.encrypt,this._decrypt=e.decrypt,this.algorithm.initialize(e)};t.prototype.start=function(t){t=t||{};var n={};for(var r in t)n[r]=t[r];n.decrypt=this._decrypt,this._finish=!1,this._input=e.util.createBuffer(),this.output=t.output||e.util.createBuffer(),this.mode.start(n)},t.prototype.update=function(e){e&&this._input.putBuffer(e);while(!this._op.call(this.mode,this._input,this.output,this._finish)&&!this._finish);this._input.compact()},t.prototype.finish=function(e){e&&(this.mode.name==="ECB"||this.mode.name==="CBC")&&(this.mode.pad=function(t){return e(this.blockSize,t,!1)},this.mode.unpad=function(t){return e(this.blockSize,t,!0)});var t={};return t.decrypt=this._decrypt,t.overflow=this._input.length()%this.blockSize,!this._decrypt&&this.mode.pad&&!this.mode.pad(this._input,t)?!1:(this._finish=!0,this.update(),this._decrypt&&this.mode.unpad&&!this.mode.unpad(this.output,t)?!1:this.mode.afterFinish&&!this.mode.afterFinish(this.output,t)?!1:!0)}}var r="cipher";if(typeof n!="function"){if(typeof module!="object"||!module.exports)return typeof forge=="undefined"&&(forge={}),e(forge);var i=!0;n=function(e,n){n(t,module)}}var s,o=function(t,n){n.exports=function(n){var i=s.map(function(e){return t(e)}).concat(e);n=n||{},n.defined=n.defined||{};if(n.defined[r])return n[r];n.defined[r]=!0;for(var o=0;o<i.length;++o)i[o](n);return n[r]}},u=n;n=function(e,t){return s=typeof e=="string"?t.slice(2):e.slice(2),i?(delete n,u.apply(null,Array.prototype.slice.call(arguments,0))):(n=u,n.apply(null,Array.prototype.slice.call(arguments,0)))},n("js/cipher",["require","module","./util"],function(){o.apply(null,Array.prototype.slice.call(arguments,0))})}(),function(){function e(e){function n(t){typeof t=="string"&&(t=e.util.createBuffer(t));if(e.util.isArray(t)&&t.length>4){var n=t;t=e.util.createBuffer();for(var r=0;r<n.length;++r)t.putByte(n[r])}return e.util.isArray(t)||(t=[t.getInt32(),t.getInt32(),t.getInt32(),t.getInt32()]),t}function r(e){e[e.length-1]=e[e.length-1]+1&4294967295}function i(e){return[e/4294967296|0,e&4294967295]}e.cipher=e.cipher||{};var t=e.cipher.modes=e.cipher.modes||{};t.ecb=function(e){e=e||{},this.name="ECB",this.cipher=e.cipher,this.blockSize=e.blockSize||16,this._ints=this.blockSize/4,this._inBlock=new Array(this._ints),this._outBlock=new Array(this._ints)},t.ecb.prototype.start=function(e){},t.ecb.prototype.encrypt=function(e,t,n){if(e.length()<this.blockSize&&!(n&&e.length()>0))return!0;for(var r=0;r<this._ints;++r)this._inBlock[r]=e.getInt32();this.cipher.encrypt(this._inBlock,this._outBlock);for(var r=0;r<this._ints;++r)t.putInt32(this._outBlock[r])},t.ecb.prototype.decrypt=function(e,t,n){if(e.length()<this.blockSize&&!(n&&e.length()>0))return!0;for(var r=0;r<this._ints;++r)this._inBlock[r]=e.getInt32();this.cipher.decrypt(this._inBlock,this._outBlock);for(var r=0;r<this._ints;++r)t.putInt32(this._outBlock[r])},t.ecb.prototype.pad=function(e,t){var n=e.length()===this.blockSize?this.blockSize:this.blockSize-e.length();return e.fillWithByte(n,n),!0},t.ecb.prototype.unpad=function(e,t){if(t.overflow>0)return!1;var n=e.length(),r=e.at(n-1);return r>this.blockSize<<2?!1:(e.truncate(r),!0)},t.cbc=function(e){e=e||{},this.name="CBC",this.cipher=e.cipher,this.blockSize=e.blockSize||16,this._ints=this.blockSize/4,this._inBlock=new Array(this._ints),this._outBlock=new Array(this._ints)},t.cbc.prototype.start=function(e){if(e.iv===null){if(!this._prev)throw new Error("Invalid IV parameter.");this._iv=this._prev.slice(0)}else{if(!("iv"in e))throw new Error("Invalid IV parameter.");this._iv=n(e.iv),this._prev=this._iv.slice(0)}},t.cbc.prototype.encrypt=function(e,t,n){if(e.length()<this.blockSize&&!(n&&e.length()>0))return!0;for(var r=0;r<this._ints;++r)this._inBlock[r]=this._prev[r]^e.getInt32();this.cipher.encrypt(this._inBlock,this._outBlock);for(var r=0;r<this._ints;++r)t.putInt32(this._outBlock[r]);this._prev=this._outBlock},t.cbc.prototype.decrypt=function(e,t,n){if(e.length()<this.blockSize&&!(n&&e.length()>0))return!0;for(var r=0;r<this._ints;++r)this._inBlock[r]=e.getInt32();this.cipher.decrypt(this._inBlock,this._outBlock);for(var r=0;r<this._ints;++r)t.putInt32(this._prev[r]^this._outBlock[r]);this._prev=this._inBlock.slice(0)},t.cbc.prototype.pad=function(e,t){var n=e.length()===this.blockSize?this.blockSize:this.blockSize-e.length();return e.fillWithByte(n,n),!0},t.cbc.prototype.unpad=function(e,t){if(t.overflow>0)return!1;var n=e.length(),r=e.at(n-1);return r>this.blockSize<<2?!1:(e.truncate(r),!0)},t.cfb=function(t){t=t||{},this.name="CFB",this.cipher=t.cipher,this.blockSize=t.blockSize||16,this._ints=this.blockSize/4,this._inBlock=null,this._outBlock=new Array(this._ints),this._partialBlock=new Array(this._ints),this._partialOutput=e.util.createBuffer(),this._partialBytes=0},t.cfb.prototype.start=function(e){if(!("iv"in e))throw new Error("Invalid IV parameter.");this._iv=n(e.iv),this._inBlock=this._iv.slice(0),this._partialBytes=0},t.cfb.prototype.encrypt=function(e,t,n){var r=e.length();if(r===0)return!0;this.cipher.encrypt(this._inBlock,this._outBlock);if(this._partialBytes===0&&r>=this.blockSize){for(var i=0;i<this._ints;++i)this._inBlock[i]=e.getInt32()^this._outBlock[i],t.putInt32(this._inBlock[i]);return}var s=(this.blockSize-r)%this.blockSize;s>0&&(s=this.blockSize-s),this._partialOutput.clear();for(var i=0;i<this._ints;++i)this._partialBlock[i]=e.getInt32()^this._outBlock[i],this._partialOutput.putInt32(this._partialBlock[i]);if(s>0)e.read-=this.blockSize;else for(var i=0;i<this._ints;++i)this._inBlock[i]=this._partialBlock[i];this._partialBytes>0&&this._partialOutput.getBytes(this._partialBytes);if(s>0&&!n)return t.putBytes(this._partialOutput.getBytes(s-this._partialBytes)),this._partialBytes=s,!0;t.putBytes(this._partialOutput.getBytes(r-this._partialBytes)),this._partialBytes=0},t.cfb.prototype.decrypt=function(e,t,n){var r=e.length();if(r===0)return!0;this.cipher.encrypt(this._inBlock,this._outBlock);if(this._partialBytes===0&&r>=this.blockSize){for(var i=0;i<this._ints;++i)this._inBlock[i]=e.getInt32(),t.putInt32(this._inBlock[i]^this._outBlock[i]);return}var s=(this.blockSize-r)%this.blockSize;s>0&&(s=this.blockSize-s),this._partialOutput.clear();for(var i=0;i<this._ints;++i)this._partialBlock[i]=e.getInt32(),this._partialOutput.putInt32(this._partialBlock[i]^this._outBlock[i]);if(s>0)e.read-=this.blockSize;else for(var i=0;i<this._ints;++i)this._inBlock[i]=this._partialBlock[i];this._partialBytes>0&&this._partialOutput.getBytes(this._partialBytes);if(s>0&&!n)return t.putBytes(this._partialOutput.getBytes(s-this._partialBytes)),this._partialBytes=s,!0;t.putBytes(this._partialOutput.getBytes(r-this._partialBytes)),this._partialBytes=0},t.ofb=function(t){t=t||{},this.name="OFB",this.cipher=t.cipher,this.blockSize=t.blockSize||16,this._ints=this.blockSize/4,this._inBlock=null,this._outBlock=new Array(this._ints),this._partialOutput=e.util.createBuffer(),this._partialBytes=0},t.ofb.prototype.start=function(e){if(!("iv"in e))throw new Error("Invalid IV parameter.");this._iv=n(e.iv),this._inBlock=this._iv.slice(0),this._partialBytes=0},t.ofb.prototype.encrypt=function(e,t,n){var r=e.length();if(e.length()===0)return!0;this.cipher.encrypt(this._inBlock,this._outBlock);if(this._partialBytes===0&&r>=this.blockSize){for(var i=0;i<this._ints;++i)t.putInt32(e.getInt32()^this._outBlock[i]),this._inBlock[i]=this._outBlock[i];return}var s=(this.blockSize-r)%this.blockSize;s>0&&(s=this.blockSize-s),this._partialOutput.clear();for(var i=0;i<this._ints;++i)this._partialOutput.putInt32(e.getInt32()^this._outBlock[i]);if(s>0)e.read-=this.blockSize;else for(var i=0;i<this._ints;++i)this._inBlock[i]=this._outBlock[i];this._partialBytes>0&&this._partialOutput.getBytes(this._partialBytes);if(s>0&&!n)return t.putBytes(this._partialOutput.getBytes(s-this._partialBytes)),this._partialBytes=s,!0;t.putBytes(this._partialOutput.getBytes(r-this._partialBytes)),this._partialBytes=0},t.ofb.prototype.decrypt=t.ofb.prototype.encrypt,t.ctr=function(t){t=t||{},this.name="CTR",this.cipher=t.cipher,this.blockSize=t.blockSize||16,this._ints=this.blockSize/4,this._inBlock=null,this._outBlock=new Array(this._ints),this._partialOutput=e.util.createBuffer(),this._partialBytes=0},t.ctr.prototype.start=function(e){if(!("iv"in e))throw new Error("Invalid IV parameter.");this._iv=n(e.iv),this._inBlock=this._iv.slice(0),this._partialBytes=0},t.ctr.prototype.encrypt=function(e,t,n){var i=e.length();if(i===0)return!0;this.cipher.encrypt(this._inBlock,this._outBlock);if(this._partialBytes===0&&i>=this.blockSize)for(var s=0;s<this._ints;++s)t.putInt32(e.getInt32()^this._outBlock[s]);else{var o=(this.blockSize-i)%this.blockSize;o>0&&(o=this.blockSize-o),this._partialOutput.clear();for(var s=0;s<this._ints;++s)this._partialOutput.putInt32(e.getInt32()^this._outBlock[s]);o>0&&(e.read-=this.blockSize),this._partialBytes>0&&this._partialOutput.getBytes(this._partialBytes);if(o>0&&!n)return t.putBytes(this._partialOutput.getBytes(o-this._partialBytes)),this._partialBytes=o,!0;t.putBytes(this._partialOutput.getBytes(i-this._partialBytes)),this._partialBytes=0}r(this._inBlock)},t.ctr.prototype.decrypt=t.ctr.prototype.encrypt,t.gcm=function(t){t=t||{},this.name="GCM",this.cipher=t.cipher,this.blockSize=t.blockSize||16,this._ints=this.blockSize/4,this._inBlock=new Array(this._ints),this._outBlock=new Array(this._ints),this._partialOutput=e.util.createBuffer(),this._partialBytes=0,this._R=3774873600},t.gcm.prototype.start=function(t){if(!("iv"in t))throw new Error("Invalid IV parameter.");var n=e.util.createBuffer(t.iv);this._cipherLength=0;var s;"additionalData"in t?s=e.util.createBuffer(t.additionalData):s=e.util.createBuffer(),"tagLength"in t?this._tagLength=t.tagLength:this._tagLength=128,this._tag=null;if(t.decrypt){this._tag=e.util.createBuffer(t.tag).getBytes();if(this._tag.length!==this._tagLength/8)throw new Error("Authentication tag does not match tag length.")}this._hashBlock=new Array(this._ints),this.tag=null,this._hashSubkey=new Array(this._ints),this.cipher.encrypt([0,0,0,0],this._hashSubkey),this.componentBits=4,this._m=this.generateHashTable(this._hashSubkey,this.componentBits);var o=n.length();if(o===12)this._j0=[n.getInt32(),n.getInt32(),n.getInt32(),1];else{this._j0=[0,0,0,0];while(n.length()>0)this._j0=this.ghash(this._hashSubkey,this._j0,[n.getInt32(),n.getInt32(),n.getInt32(),n.getInt32()]);this._j0=this.ghash(this._hashSubkey,this._j0,[0,0].concat(i(o*8)))}this._inBlock=this._j0.slice(0),r(this._inBlock),this._partialBytes=0,s=e.util.createBuffer(s),this._aDataLength=i(s.length()*8);var u=s.length()%this.blockSize;u&&s.fillWithByte(0,this.blockSize-u),this._s=[0,0,0,0];while(s.length()>0)this._s=this.ghash(this._hashSubkey,this._s,[s.getInt32(),s.getInt32(),s.getInt32(),s.getInt32()])},t.gcm.prototype.encrypt=function(e,t,n){var i=e.length();if(i===0)return!0;this.cipher.encrypt(this._inBlock,this._outBlock);if(this._partialBytes===0&&i>=this.blockSize){for(var s=0;s<this._ints;++s)t.putInt32(this._outBlock[s]^=e.getInt32());this._cipherLength+=this.blockSize}else{var o=(this.blockSize-i)%this.blockSize;o>0&&(o=this.blockSize-o),this._partialOutput.clear();for(var s=0;s<this._ints;++s)this._partialOutput.putInt32(e.getInt32()^this._outBlock[s]);if(o===0||n){if(n){var u=i%this.blockSize;this._cipherLength+=u,this._partialOutput.truncate(this.blockSize-u)}else this._cipherLength+=this.blockSize;for(var s=0;s<this._ints;++s)this._outBlock[s]=this._partialOutput.getInt32();this._partialOutput.read-=this.blockSize}this._partialBytes>0&&this._partialOutput.getBytes(this._partialBytes);if(o>0&&!n)return e.read-=this.blockSize,t.putBytes(this._partialOutput.getBytes(o-this._partialBytes)),this._partialBytes=o,!0;t.putBytes(this._partialOutput.getBytes(i-this._partialBytes)),this._partialBytes=0}this._s=this.ghash(this._hashSubkey,this._s,this._outBlock),r(this._inBlock)},t.gcm.prototype.decrypt=function(e,t,n){var i=e.length();if(i<this.blockSize&&!(n&&i>0))return!0;this.cipher.encrypt(this._inBlock,this._outBlock),r(this._inBlock),this._hashBlock[0]=e.getInt32(),this._hashBlock[1]=e.getInt32(),this._hashBlock[2]=e.getInt32(),this._hashBlock[3]=e.getInt32(),this._s=this.ghash(this._hashSubkey,this._s,this._hashBlock);for(var s=0;s<this._ints;++s)t.putInt32(this._outBlock[s]^this._hashBlock[s]);i<this.blockSize?this._cipherLength+=i%this.blockSize:this._cipherLength+=this.blockSize},t.gcm.prototype.afterFinish=function(t,n){var r=!0;n.decrypt&&n.overflow&&t.truncate(this.blockSize-n.overflow),this.tag=e.util.createBuffer();var s=this._aDataLength.concat(i(this._cipherLength*8));this._s=this.ghash(this._hashSubkey,this._s,s);var o=[];this.cipher.encrypt(this._j0,o);for(var u=0;u<this._ints;++u)this.tag.putInt32(this._s[u]^o[u]);return this.tag.truncate(this.tag.length()%(this._tagLength/8)),n.decrypt&&this.tag.bytes()!==this._tag&&(r=!1),r},t.gcm.prototype.multiply=function(e,t){var n=[0,0,0,0],r=t.slice(0);for(var i=0;i<128;++i){var s=e[i/32|0]&1<<31-i%32;s&&(n[0]^=r[0],n[1]^=r[1],n[2]^=r[2],n[3]^=r[3]),this.pow(r,r)}return n},t.gcm.prototype.pow=function(e,t){var n=e[3]&1;for(var r=3;r>0;--r)t[r]=e[r]>>>1|(e[r-1]&1)<<31;t[0]=e[0]>>>1,n&&(t[0]^=this._R)},t.gcm.prototype.tableMultiply=function(e){var t=[0,0,0,0];for(var n=0;n<32;++n){var r=n/8|0,i=e[r]>>>(7-n%8)*4&15,s=this._m[n][i];t[0]^=s[0],t[1]^=s[1],t[2]^=s[2],t[3]^=s[3]}return t},t.gcm.prototype.ghash=function(e,t,n){return t[0]^=n[0],t[1]^=n[1],t[2]^=n[2],t[3]^=n[3],this.tableMultiply(t)},t.gcm.prototype.generateHashTable=function(e,t){var n=8/t,r=4*n,i=16*n,s=new Array(i);for(var o=0;o<i;++o){var u=[0,0,0,0],a=o/r|0,f=(r-1-o%r)*t;u[a]=1<<t-1<<f,s[o]=this.generateSubHashTable(this.multiply(u,e),t)}return s},t.gcm.prototype.generateSubHashTable=function(e,t){var n=1<<t,r=n>>>1,i=new Array(n);i[r]=e.slice(0);var s=r>>>1;while(s>0)this.pow(i[2*s],i[s]=[]),s>>=1;s=2;while(s<r){for(var o=1;o<s;++o){var u=i[s],a=i[o];i[s+o]=[u[0]^a[0],u[1]^a[1],u[2]^a[2],u[3]^a[3]]}s*=2}i[0]=[0,0,0,0];for(s=r+1;s<n;++s){var f=i[s^r];i[s]=[e[0]^f[0],e[1]^f[1],e[2]^f[2],e[3]^f[3]]}return i}}var r="cipherModes";if(typeof n!="function"){if(typeof module!="object"||!module.exports)return typeof forge=="undefined"&&(forge={}),e(forge);var i=!0;n=function(e,n){n(t,module)}}var s,o=function(t,n){n.exports=function(n){var i=s.map(function(e){return t(e)}).concat(e);n=n||{},n.defined=n.defined||{};if(n.defined[r])return n[r];n.defined[r]=!0;for(var o=0;o<i.length;++o)i[o](n);return n[r]}},u=n;n=function(e,t){return s=typeof e=="string"?t.slice(2):e.slice(2),i?(delete n,u.apply(null,Array.prototype.slice.call(arguments,0))):(n=u,n.apply(null,Array.prototype.slice.call(arguments,0)))},n("js/cipherModes",["require","module","./util"],function(){o.apply(null,Array.prototype.slice.call(arguments,0))})}(),function(){function e(e){function t(t,n){var r=function(){return new e.aes.Algorithm(t,n)};e.cipher.registerAlgorithm(t,r)}function f(){n=!0,o=[0,1,2,4,8,16,32,64,128,27,54];var e=new Array(256);for(var t=0;t<128;++t)e[t]=t<<1,e[t+128]=t+128<<1^283;i=new Array(256),s=new Array(256),u=new Array(4),a=new Array(4);for(var t=0;t<4;++t)u[t]=new Array(256),a[t]=new Array(256);var r=0,f=0,l,c,h,p,d,v,m;for(var t=0;t<256;++t){p=f^f<<1^f<<2^f<<3^f<<4,p=p>>8^p&255^99,i[r]=p,s[p]=r,d=e[p],l=e[r],c=e[l],h=e[c],v=d<<24^p<<16^p<<8^(p^d),m=(l^c^h)<<24^(r^h)<<16^(r^c^h)<<8^(r^l^h);for(var g=0;g<4;++g)u[g][r]=v,a[g][p]=m,v=v<<24|v>>>8,m=m<<24|m>>>8;r===0?r=f=1:(r=l^e[e[e[l^h]]],f^=e[e[f]])}}function l(e,t){var n=e.slice(0),s,u=1,f=n.length,l=f+6+1,c=r*l;for(var h=f;h<c;++h)s=n[h-1],h%f===0?(s=i[s>>>16&255]<<24^i[s>>>8&255]<<16^i[s&255]<<8^i[s>>>24]^o[u]<<24,u++):f>6&&h%f===4&&(s=i[s>>>24]<<24^i[s>>>16&255]<<16^i[s>>>8&255]<<8^i[s&255]),n[h]=n[h-f]^s;if(t){var p,d=a[0],v=a[1],m=a[2],g=a[3],y=n.slice(0);c=n.length;for(var h=0,b=c-r;h<c;h+=r,b-=r)if(h===0||h===c-r)y[h]=n[b],y[h+1]=n[b+3],y[h+2]=n[b+2],y[h+3]=n[b+1];else for(var w=0;w<r;++w)p=n[b+w],y[h+(3&-w)]=d[i[p>>>24]]^v[i[p>>>16&255]]^m[i[p>>>8&255]]^g[i[p&255]];n=y}return n}function c(e,t,n,r){var o=e.length/4-1,f,l,c,h,p;r?(f=a[0],l=a[1],c=a[2],h=a[3],p=s):(f=u[0],l=u[1],c=u[2],h=u[3],p=i);var d,v,m,g,y,b,w;d=t[0]^e[0],v=t[r?3:1]^e[1],m=t[2]^e[2],g=t[r?1:3]^e[3];var E=3;for(var S=1;S<o;++S)y=f[d>>>24]^l[v>>>16&255]^c[m>>>8&255]^h[g&255]^e[++E],b=f[v>>>24]^l[m>>>16&255]^c[g>>>8&255]^h[d&255]^e[++E],w=f[m>>>24]^l[g>>>16&255]^c[d>>>8&255]^h[v&255]^e[++E],g=f[g>>>24]^l[d>>>16&255]^c[v>>>8&255]^h[m&255]^e[++E],d=y,v=b,m=w;n[0]=p[d>>>24]<<24^p[v>>>16&255]<<16^p[m>>>8&255]<<8^p[g&255]^e[++E],n[r?3:1]=p[v>>>24]<<24^p[m>>>16&255]<<16^p[g>>>8&255]<<8^p[d&255]^e[++E],n[2]=p[m>>>24]<<24^p[g>>>16&255]<<16^p[d>>>8&255]<<8^p[v&255]^e[++E],n[r?1:3]=p[g>>>24]<<24^p[d>>>16&255]<<16^p[v>>>8&255]<<8^p[m&255]^e[++E]}function h(t){t=t||{};var n=(t.mode||"CBC").toUpperCase(),r="AES-"+n,i;t.decrypt?i=e.cipher.createDecipher(r,t.key):i=e.cipher.createCipher(r,t.key);var s=i.start;return i.start=function(t,n){var r=null;n instanceof e.util.ByteBuffer&&(r=n,n={}),n=n||{},n.output=r,n.iv=t,s.call(i,n)},i}e.aes=e.aes||{},e.aes.startEncrypting=function(e,t,n,r){var i=h({key:e,output:n,decrypt:!1,mode:r});return i.start(t),i},e.aes.createEncryptionCipher=function(e,t){return h({key:e,output:null,decrypt:!1,mode:t})},e.aes.startDecrypting=function(e,t,n,r){var i=h({key:e,output:n,decrypt:!0,mode:r});return i.start(t),i},e.aes.createDecryptionCipher=function(e,t){return h({key:e,output:null,decrypt:!0,mode:t})},e.aes.Algorithm=function(e,t){n||f();var r=this;r.name=e,r.mode=new t({blockSize:16,cipher:{encrypt:function(e,t){return c(r._w,e,t,!1)},decrypt:function(e,t){return c(r._w,e,t,!0)}}}),r._init=!1},e.aes.Algorithm.prototype.initialize=function(t){if(this._init)return;var n=t.key,r;if(typeof n!="string"||n.length!==16&&n.length!==24&&n.length!==32){if(e.util.isArray(n)&&(n.length===16||n.length===24||n.length===32)){r=n,n=e.util.createBuffer();for(var i=0;i<r.length;++i)n.putByte(r[i])}}else n=e.util.createBuffer(n);if(!e.util.isArray(n)){r=n,n=[];var s=r.length();if(s===16||s===24||s===32){s>>>=2;for(var i=0;i<s;++i)n.push(r.getInt32())}}if(!e.util.isArray(n)||n.length!==4&&n.length!==6&&n.length!==8)throw new Error("Invalid key parameter.");var o=this.mode.name,u=["CFB","OFB","CTR","GCM"].indexOf(o)!==-1;this._w=l(n,t.decrypt&&!u),this._init=!0},e.aes._expandKey=function(e,t){return n||f(),l(e,t)},e.aes._updateBlock=c,t("AES-ECB",e.cipher.modes.ecb),t("AES-CBC",e.cipher.modes.cbc),t("AES-CFB",e.cipher.modes.cfb),t("AES-OFB",e.cipher.modes.ofb),t("AES-CTR",e.cipher.modes.ctr),t("AES-GCM",e.cipher.modes.gcm);var n=!1,r=4,i,s,o,u,a}var r="aes";if(typeof n!="function"){if(typeof module!="object"||!module.exports)return typeof forge=="undefined"&&(forge={}),e(forge);var i=!0;n=function(e,n){n(t,module)}}var s,o=function(t,n){n.exports=function(n){var i=s.map(function(e){return t(e)}).concat(e);n=n||{},n.defined=n.defined||{};if(n.defined[r])return n[r];n.defined[r]=!0;for(var o=0;o<i.length;++o)i[o](n);return n[r]}},u=n;n=function(e,t){return s=typeof e=="string"?t.slice(2):e.slice(2),i?(delete n,u.apply(null,Array.prototype.slice.call(arguments,0))):(n=u,n.apply(null,Array.prototype.slice.call(arguments,0)))},n("js/aes",["require","module","./cipher","./cipherModes","./util"],function(){o.apply(null,Array.prototype.slice.call(arguments,0))})}(),function(){function e(e){function u(){n=String.fromCharCode(128),n+=e.util.fillString(String.fromCharCode(0),64),r=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,1,6,11,0,5,10,15,4,9,14,3,8,13,2,7,12,5,8,11,14,1,4,7,10,13,0,3,6,9,12,15,2,0,7,14,5,12,3,10,1,8,15,6,13,4,11,2,9],i=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21],s=new Array(64);for(var t=0;t<64;++t)s[t]=Math.floor(Math.abs(Math.sin(t+1))*4294967296);o=!0}function a(e,t,n){var o,u,a,f,l,c,h,p,d=n.length();while(d>=64){u=e.h0,a=e.h1,f=e.h2,l=e.h3;for(p=0;p<16;++p)t[p]=n.getInt32Le(),c=l^a&(f^l),o=u+c+s[p]+t[p],h=i[p],u=l,l=f,f=a,a+=o<<h|o>>>32-h;for(;p<32;++p)c=f^l&(a^f),o=u+c+s[p]+t[r[p]],h=i[p],u=l,l=f,f=a,a+=o<<h|o>>>32-h;for(;p<48;++p)c=a^f^l,o=u+c+s[p]+t[r[p]],h=i[p],u=l,l=f,f=a,a+=o<<h|o>>>32-h;for(;p<64;++p)c=f^(a|~l),o=u+c+s[p]+t[r[p]],h=i[p],u=l,l=f,f=a,a+=o<<h|o>>>32-h;e.h0=e.h0+u|0,e.h1=e.h1+a|0,e.h2=e.h2+f|0,e.h3=e.h3+l|0,d-=64}}var t=e.md5=e.md5||{};e.md=e.md||{},e.md.algorithms=e.md.algorithms||{},e.md.md5=e.md.algorithms.md5=t,t.create=function(){o||u();var t=null,r=e.util.createBuffer(),i=new Array(16),s={algorithm:"md5",blockLength:64,digestLength:16,messageLength:0,messageLength64:[0,0]};return s.start=function(){return s.messageLength=0,s.messageLength64=[0,0],r=e.util.createBuffer(),t={h0:1732584193,h1:4023233417,h2:2562383102,h3:271733878},s},s.start(),s.update=function(n,o){return o==="utf8"&&(n=e.util.encodeUtf8(n)),s.messageLength+=n.length,s.messageLength64[0]+=n.length/4294967296>>>0,s.messageLength64[1]+=n.length>>>0,r.putBytes(n),a(t,i,r),(r.read>2048||r.length()===0)&&r.compact(),s},s.digest=function(){var o=e.util.createBuffer();o.putBytes(r.bytes()),o.putBytes(n.substr(0,64-(s.messageLength64[1]+8&63))),o.putInt32Le(s.messageLength64[1]<<3),o.putInt32Le(s.messageLength64[0]<<3|s.messageLength64[0]>>>28);var u={h0:t.h0,h1:t.h1,h2:t.h2,h3:t.h3};a(u,i,o);var f=e.util.createBuffer();return f.putInt32Le(u.h0),f.putInt32Le(u.h1),f.putInt32Le(u.h2),f.putInt32Le(u.h3),f},s};var n=null,r=null,i=null,s=null,o=!1}var r="md5";if(typeof n!="function"){if(typeof module!="object"||!module.exports)return typeof forge=="undefined"&&(forge={}),e(forge);var i=!0;n=function(e,n){n(t,module)}}var s,o=function(t,n){n.exports=function(n){var i=s.map(function(e){return t(e)}).concat(e);n=n||{},n.defined=n.defined||{};if(n.defined[r])return n[r];n.defined[r]=!0;for(var o=0;o<i.length;++o)i[o](n);return n[r]}},u=n;n=function(e,t){return s=typeof e=="string"?t.slice(2):e.slice(2),i?(delete n,u.apply(null,Array.prototype.slice.call(arguments,0))):(n=u,n.apply(null,Array.prototype.slice.call(arguments,0)))},n("js/md5",["require","module","./util"],function(){o.apply(null,Array.prototype.slice.call(arguments,0))})}(),function(){function e(e){function i(){n=String.fromCharCode(128),n+=e.util.fillString(String.fromCharCode(0),64),r=!0}function s(e,t,n){var r,i,s,o,u,a,f,l,c=n.length();while(c>=64){i=e.h0,s=e.h1,o=e.h2,u=e.h3,a=e.h4;for(l=0;l<16;++l)r=n.getInt32(),t[l]=r,f=u^s&(o^u),r=(i<<5|i>>>27)+f+a+1518500249+r,a=u,u=o,o=s<<30|s>>>2,s=i,i=r;for(;l<20;++l)r=t[l-3]^t[l-8]^t[l-14]^t[l-16],r=r<<1|r>>>31,t[l]=r,f=u^s&(o^u),r=(i<<5|i>>>27)+f+a+1518500249+r,a=u,u=o,o=s<<30|s>>>2,s=i,i=r;for(;l<32;++l)r=t[l-3]^t[l-8]^t[l-14]^t[l-16],r=r<<1|r>>>31,t[l]=r,f=s^o^u,r=(i<<5|i>>>27)+f+a+1859775393+r,a=u,u=o,o=s<<30|s>>>2,s=i,i=r;for(;l<40;++l)r=t[l-6]^t[l-16]^t[l-28]^t[l-32],r=r<<2|r>>>30,t[l]=r,f=s^o^u,r=(i<<5|i>>>27)+f+a+1859775393+r,a=u,u=o,o=s<<30|s>>>2,s=i,i=r;for(;l<60;++l)r=t[l-6]^t[l-16]^t[l-28]^t[l-32],r=r<<2|r>>>30,t[l]=r,f=s&o|u&(s^o),r=(i<<5|i>>>27)+f+a+2400959708+r,a=u,u=o,o=s<<30|s>>>2,s=i,i=r;for(;l<80;++l)r=t[l-6]^t[l-16]^t[l-28]^t[l-32],r=r<<2|r>>>30,t[l]=r,f=s^o^u,r=(i<<5|i>>>27)+f+a+3395469782+r,a=u,u=o,o=s<<30|s>>>2,s=i,i=r;e.h0=e.h0+i|0,e.h1=e.h1+s|0,e.h2=e.h2+o|0,e.h3=e.h3+u|0,e.h4=e.h4+a|0,c-=64}}var t=e.sha1=e.sha1||{};e.md=e.md||{},e.md.algorithms=e.md.algorithms||{},e.md.sha1=e.md.algorithms.sha1=t,t.create=function(){r||i();var t=null,o=e.util.createBuffer(),u=new Array(80),a={algorithm:"sha1",blockLength:64,digestLength:20,messageLength:0,messageLength64:[0,0]};return a.start=function(){return a.messageLength=0,a.messageLength64=[0,0],o=e.util.createBuffer(),t={h0:1732584193,h1:4023233417,h2:2562383102,h3:271733878,h4:3285377520},a},a.start(),a.update=function(n,r){return r==="utf8"&&(n=e.util.encodeUtf8(n)),a.messageLength+=n.length,a.messageLength64[0]+=n.length/4294967296>>>0,a.messageLength64[1]+=n.length>>>0,o.putBytes(n),s(t,u,o),(o.read>2048||o.length()===0)&&o.compact(),a},a.digest=function(){var r=e.util.createBuffer();r.putBytes(o.bytes()),r.putBytes(n.substr(0,64-(a.messageLength64[1]+8&63))),r.putInt32(a.messageLength64[0]<<3|a.messageLength64[0]>>>28),r.putInt32(a.messageLength64[1]<<3);var i={h0:t.h0,h1:t.h1,h2:t.h2,h3:t.h3,h4:t.h4};s(i,u,r);var f=e.util.createBuffer();return f.putInt32(i.h0),f.putInt32(i.h1),f.putInt32(i.h2),f.putInt32(i.h3),f.putInt32(i.h4),f},a};var n=null,r=!1}var r="sha1";if(typeof n!="function"){if(typeof module!="object"||!module.exports)return typeof forge=="undefined"&&(forge={}),e(forge);var i=!0;n=function(e,n){n(t,module)}}var s,o=function(t,n){n.exports=function(n){var i=s.map(function(e){return t(e)}).concat(e);n=n||{},n.defined=n.defined||{};if(n.defined[r])return n[r];n.defined[r]=!0;for(var o=0;o<i.length;++o)i[o](n);return n[r]}},u=n;n=function(e,t){return s=typeof e=="string"?t.slice(2):e.slice(2),i?(delete n,u.apply(null,Array.prototype.slice.call(arguments,0))):(n=u,n.apply(null,Array.prototype.slice.call(arguments,0)))},n("js/sha1",["require","module","./util"],function(){o.apply(null,Array.prototype.slice.call(arguments,0))})}(),function(){function e(e){function s(){n=String.fromCharCode(128),n+=e.util.fillString(String.fromCharCode(0),64),i=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298],r=!0}function o(e,t,n){var r,s,o,u,a,f,l,c,h,p,d,v,m,g,y,b=n.length();while(b>=64){for(l=0;l<16;++l)t[l]=n.getInt32();for(;l<64;++l)r=t[l-2],r=(r>>>17|r<<15)^(r>>>19|r<<13)^r>>>10,s=t[l-15],s=(s>>>7|s<<25)^(s>>>18|s<<14)^s>>>3,t[l]=r+t[l-7]+s+t[l-16]|0;c=e.h0,h=e.h1,p=e.h2,d=e.h3,v=e.h4,m=e.h5,g=e.h6,y=e.h7;for(l=0;l<64;++l)u=(v>>>6|v<<26)^(v>>>11|v<<21)^(v>>>25|v<<7),a=g^v&(m^g),o=(c>>>2|c<<30)^(c>>>13|c<<19)^(c>>>22|c<<10),f=c&h|p&(c^h),r=y+u+a+i[l]+t[l],s=o+f,y=g,g=m,m=v,v=d+r|0,d=p,p=h,h=c,c=r+s|0;e.h0=e.h0+c|0,e.h1=e.h1+h|0,e.h2=e.h2+p|0,e.h3=e.h3+d|0,e.h4=e.h4+v|0,e.h5=e.h5+m|0,e.h6=e.h6+g|0,e.h7=e.h7+y|0,b-=64}}var t=e.sha256=e.sha256||{};e.md=e.md||{},e.md.algorithms=e.md.algorithms||{},e.md.sha256=e.md.algorithms.sha256=t,t.create=function(){r||s();var t=null,i=e.util.createBuffer(),u=new Array(64),a={algorithm:"sha256",blockLength:64,digestLength:32,messageLength:0,messageLength64:[0,0]};return a.start=function(){return a.messageLength=0,a.messageLength64=[0,0],i=e.util.createBuffer(),t={h0:1779033703,h1:3144134277,h2:1013904242,h3:2773480762,h4:1359893119,h5:2600822924,h6:528734635,h7:1541459225},a},a.start(),a.update=function(n,r){return r==="utf8"&&(n=e.util.encodeUtf8(n)),a.messageLength+=n.length,a.messageLength64[0]+=n.length/4294967296>>>0,a.messageLength64[1]+=n.length>>>0,i.putBytes(n),o(t,u,i),(i.read>2048||i.length()===0)&&i.compact(),a},a.digest=function(){var r=e.util.createBuffer();r.putBytes(i.bytes()),r.putBytes(n.substr(0,64-(a.messageLength64[1]+8&63))),r.putInt32(a.messageLength64[0]<<3|a.messageLength64[0]>>>28),r.putInt32(a.messageLength64[1]<<3);var s={h0:t.h0,h1:t.h1,h2:t.h2,h3:t.h3,h4:t.h4,h5:t.h5,h6:t.h6,h7:t.h7};o(s,u,r);var f=e.util.createBuffer();return f.putInt32(s.h0),f.putInt32(s.h1),f.putInt32(s.h2),f.putInt32(s.h3),f.putInt32(s.h4),f.putInt32(s.h5),f.putInt32(s.h6),f.putInt32(s.h7),f},a};var n=null,r=!1,i=null}var r="sha256";if(typeof n!="function"){if(typeof module!="object"||!module.exports)return typeof forge=="undefined"&&(forge={}),e(forge);var i=!0;n=function(e,n){n(t,module)}}var s,o=function(t,n){n.exports=function(n){var i=s.map(function(e){return t(e)}).concat(e);n=n||{},n.defined=n.defined||{};if(n.defined[r])return n[r];n.defined[r]=!0;for(var o=0;o<i.length;++o)i[o](n);return n[r]}},u=n;n=function(e,t){return s=typeof e=="string"?t.slice(2):e.slice(2),i?(delete n,u.apply(null,Array.prototype.slice.call(arguments,0))):(n=u,n.apply(null,Array.prototype.slice.call(arguments,0)))},n("js/sha256",["require","module","./util"],function(){o.apply(null,Array.prototype.slice.call(arguments,0))})}(),function(){function e(e){function u(){r=String.fromCharCode(128),r+=e.util.fillString(String.fromCharCode(0),128),s=[[1116352408,3609767458],[1899447441,602891725],[3049323471,3964484399],[3921009573,2173295548],[961987163,4081628472],[1508970993,3053834265],[2453635748,2937671579],[2870763221,3664609560],[3624381080,2734883394],[310598401,1164996542],[607225278,1323610764],[1426881987,3590304994],[1925078388,4068182383],[2162078206,991336113],[2614888103,633803317],[3248222580,3479774868],[3835390401,2666613458],[4022224774,944711139],[264347078,2341262773],[604807628,2007800933],[770255983,1495990901],[1249150122,1856431235],[1555081692,3175218132],[1996064986,2198950837],[2554220882,3999719339],[2821834349,766784016],[2952996808,2566594879],[3210313671,3203337956],[3336571891,1034457026],[3584528711,2466948901],[113926993,3758326383],[338241895,168717936],[666307205,1188179964],[773529912,1546045734],[1294757372,1522805485],[1396182291,2643833823],[1695183700,2343527390],[1986661051,1014477480],[2177026350,1206759142],[2456956037,344077627],[2730485921,1290863460],[2820302411,3158454273],[3259730800,3505952657],[3345764771,106217008],[3516065817,3606008344],[3600352804,1432725776],[4094571909,1467031594],[275423344,851169720],[430227734,3100823752],[506948616,1363258195],[659060556,3750685593],[883997877,3785050280],[958139571,3318307427],[1322822218,3812723403],[1537002063,2003034995],[1747873779,3602036899],[1955562222,1575990012],[2024104815,1125592928],[2227730452,2716904306],[2361852424,442776044],[2428436474,593698344],[2756734187,3733110249],[3204031479,2999351573],[3329325298,3815920427],[3391569614,3928383900],[3515267271,566280711],[3940187606,3454069534],[4118630271,4000239992],[116418474,1914138554],[174292421,2731055270],[289380356,3203993006],[460393269,320620315],[685471733,587496836],[852142971,1086792851],[1017036298,365543100],[1126000580,2618297676],[1288033470,3409855158],[1501505948,4234509866],[1607167915,987167468],[1816402316,1246189591]],o={},o["SHA-512"]=[[1779033703,4089235720],[3144134277,2227873595],[1013904242,4271175723],[2773480762,1595750129],[1359893119,2917565137],[2600822924,725511199],[528734635,4215389547],[1541459225,327033209]],o["SHA-384"]=[[3418070365,3238371032],[1654270250,914150663],[2438529370,812702999],[355462360,4144912697],[1731405415,4290775857],[2394180231,1750603025],[3675008525,1694076839],[1203062813,3204075428]],o["SHA-512/256"]=[[573645204,4230739756],[2673172387,3360449730],[596883563,1867755857],[2520282905,1497426621],[2519219938,2827943907],[3193839141,1401305490],[721525244,746961066],[246885852,2177182882]],o["SHA-512/224"]=[[2352822216,424955298],[1944164710,2312950998],[502970286,855612546],[1738396948,1479516111],[258812777,2077511080],[2011393907,79989058],[1067287976,1780299464],[286451373,2446758561]],i=!0}function a(e,t,n){var r,i,o,u,a,f,l,c,h,p,d,v,m,g,y,b,w,E,S,x,T,N,C,k,L,A,O,M,_,D,P,H,B,j,F,I=n.length();while(I>=128){for(_=0;_<16;++_)t[_][0]=n.getInt32()>>>0,t[_][1]=n.getInt32()>>>0;for(;_<80;++_)H=t[_-2],D=H[0],P=H[1],r=((D>>>19|P<<13)^(P>>>29|D<<3)^D>>>6)>>>0,i=((D<<13|P>>>19)^(P<<3|D>>>29)^(D<<26|P>>>6))>>>0,j=t[_-15],D=j[0],P=j[1],o=((D>>>1|P<<31)^(D>>>8|P<<24)^D>>>7)>>>0,u=((D<<31|P>>>1)^(D<<24|P>>>8)^(D<<25|P>>>7))>>>0,B=t[_-7],F=t[_-16],P=i+B[1]+u+F[1],t[_][0]=r+B[0]+o+F[0]+(P/4294967296>>>0)>>>0,t[_][1]=P>>>0;m=e[0][0],g=e[0][1],y=e[1][0],b=e[1][1],w=e[2][0],E=e[2][1],S=e[3][0],x=e[3][1],T=e[4][0],N=e[4][1],C=e[5][0],k=e[5][1],L=e[6][0],A=e[6][1],O=e[7][0],M=e[7][1];for(_=0;_<80;++_)l=((T>>>14|N<<18)^(T>>>18|N<<14)^(N>>>9|T<<23))>>>0,c=((T<<18|N>>>14)^(T<<14|N>>>18)^(N<<23|T>>>9))>>>0,h=(L^T&(C^L))>>>0,p=(A^N&(k^A))>>>0,a=((m>>>28|g<<4)^(g>>>2|m<<30)^(g>>>7|m<<25))>>>0,f=((m<<4|g>>>28)^(g<<30|m>>>2)^(g<<25|m>>>7))>>>0,d=(m&y|w&(m^y))>>>0,v=(g&b|E&(g^b))>>>0,P=M+c+p+s[_][1]+t[_][1],r=O+l+h+s[_][0]+t[_][0]+(P/4294967296>>>0)>>>0,i=P>>>0,P=f+v,o=a+d+(P/4294967296>>>0)>>>0,u=P>>>0,O=L,M=A,L=C,A=k,C=T,k=N,P=x+i,T=S+r+(P/4294967296>>>0)>>>0,N=P>>>0,S=w,x=E,w=y,E=b,y=m,b=g,P=i+u,m=r+o+(P/4294967296>>>0)>>>0,g=P>>>0;P=e[0][1]+g,e[0][0]=e[0][0]+m+(P/4294967296>>>0)>>>0,e[0][1]=P>>>0,P=e[1][1]+b,e[1][0]=e[1][0]+y+(P/4294967296>>>0)>>>0,e[1][1]=P>>>0,P=e[2][1]+E,e[2][0]=e[2][0]+w+(P/4294967296>>>0)>>>0,e[2][1]=P>>>0,P=e[3][1]+x,e[3][0]=e[3][0]+S+(P/4294967296>>>0)>>>0,e[3][1]=P>>>0,P=e[4][1]+N,e[4][0]=e[4][0]+T+(P/4294967296>>>0)>>>0,e[4][1]=P>>>0,P=e[5][1]+k,e[5][0]=e[5][0]+C+(P/4294967296>>>0)>>>0,e[5][1]=P>>>0,P=e[6][1]+A,e[6][0]=e[6][0]+L+(P/4294967296>>>0)>>>0,e[6][1]=P>>>0,P=e[7][1]+M,e[7][0]=e[7][0]+O+(P/4294967296>>>0)>>>0,e[7][1]=P>>>0,I-=128}}var t=e.sha512=e.sha512||{};e.md=e.md||{},e.md.algorithms=e.md.algorithms||{},e.md.sha512=e.md.algorithms.sha512=t;var n=e.sha384=e.sha512.sha384=e.sha512.sha384||{};n.create=function(){return t.create("SHA-384")},e.md.sha384=e.md.algorithms.sha384=n,e.sha512.sha256=e.sha512.sha256||{create:function(){return t.create("SHA-512/256")}},e.md["sha512/256"]=e.md.algorithms["sha512/256"]=e.sha512.sha256,e.sha512.sha224=e.sha512.sha224||{create:function(){return t.create("SHA-512/224")}},e.md["sha512/224"]=e.md.algorithms["sha512/224"]=e.sha512.sha224,t.create=function(t){i||u(),typeof t=="undefined"&&(t="SHA-512");if(t in o){var n=o[t],s=null,f=e.util.createBuffer(),l=new Array(80);for(var c=0;c<80;++c)l[c]=new Array(2);var h={algorithm:t.replace("-","").toLowerCase(),blockLength:128,digestLength:64,messageLength:0,messageLength128:[0,0,0,0]};return h.start=function(){h.messageLength=0,h.messageLength128=[0,0,0,0],f=e.util.createBuffer(),s=new Array(n.length);for(var t=0;t<n.length;++t)s[t]=n[t].slice(0);return h},h.start(),h.update=function(t,n){n==="utf8"&&(t=e.util.encodeUtf8(t)),h.messageLength+=t.length;var r=t.length;r=[r/4294967296>>>0,r>>>0];for(var i=3;i>=0;--i)h.messageLength128[i]+=r[1],r[1]=r[0]+(h.messageLength128[i]/4294967296>>>0),h.messageLength128[i]=h.messageLength128[i]>>>0,r[0]=r[1]/4294967296>>>0;return f.putBytes(t),a(s,l,f),(f.read>2048||f.length()===0)&&f.compact(),h},h.digest=function(){var n=e.util.createBuffer();n.putBytes(f.bytes()),n.putBytes(r.substr(0,128-(h.messageLength128[3]+16&127)));var i=[];for(var o=0;o<3;++o)i[o]=h.messageLength128[o]<<3|h.messageLength128[o-1]>>>28;i[3]=h.messageLength128[3]<<3,n.putInt32(i[0]),n.putInt32(i[1]),n.putInt32(i[2]),n.putInt32(i[3]);var u=new Array(s.length);for(var o=0;o<s.length;++o)u[o]=s[o].slice(0);a(u,l,n);var c=e.util.createBuffer(),p;t==="SHA-512"?p=u.length:t==="SHA-384"?p=u.length-2:p=u.length-4;for(var o=0;o<p;++o)c.putInt32(u[o][0]),(o!==p-1||t!=="SHA-512/224")&&c.putInt32(u[o][1]);return c},h}throw new Error("Invalid SHA-512 algorithm: "+t)};var r=null,i=!1,s=null,o=null}var r="sha512";if(typeof n!="function"){if(typeof module!="object"||!module.exports)return typeof forge=="undefined"&&(forge={}),e(forge);var i=!0;n=function(e,n){n(t,module)}}var s,o=function(t,n){n.exports=function(n){var i=s.map(function(e){return t(e)}).concat(e);n=n||{},n.defined=n.defined||{};if(n.defined[r])return n[r];n.defined[r]=!0;for(var o=0;o<i.length;++o)i[o](n);return n[r]}},u=n;n=function(e,t){return s=typeof e=="string"?t.slice(2):e.slice(2),i?(delete n,u.apply(null,Array.prototype.slice.call(arguments,0))):(n=u,n.apply(null,Array.prototype.slice.call(arguments,0)))},n("js/sha512",["require","module","./util"],function(){o.apply(null,Array.prototype.slice.call(arguments,0))})}(),function(){function e(e){e.md=e.md||{},e.md.algorithms={md5:e.md5,sha1:e.sha1,sha256:e.sha256},e.md.md5=e.md5,e.md.sha1=e.sha1,e.md.sha256=e.sha256}var r="md";if(typeof n!="function"){if(typeof module!="object"||!module.exports)return typeof forge=="undefined"&&(forge={}),e(forge);var i=!0;n=function(e,n){n(t,module)}}var s,o=function(t,n){n.exports=function(n){var i=s.map(function(e){return t(e)}).concat(e);n=n||{},n.defined=n.defined||{};if(n.defined[r])return n[r];n.defined[r]=!0;for(var o=0;o<i.length;++o)i[o](n);return n[r]}},u=n;n=function(e,t){return s=typeof e=="string"?t.slice(2):e.slice(2),i?(delete n,u.apply(null,Array.prototype.slice.call(arguments,0))):(n=u,n.apply(null,Array.prototype.slice.call(arguments,0)))},n("js/md",["require","module","./md5","./sha1","./sha256","./sha512"],function(){o.apply(null,Array.prototype.slice.call(arguments,0))})}(),function(){function e(e){var t=e.hmac=e.hmac||{};t.create=function(){var t=null,n=null,r=null,i=null,s={};return s.start=function(s,o){if(s!==null)if(typeof s=="string"){s=s.toLowerCase();if(!(s in e.md.algorithms))throw new Error('Unknown hash algorithm "'+s+'"');n=e.md.algorithms[s].create()}else n=s;if(o===null)o=t;else{if(typeof o=="string")o=e.util.createBuffer(o);else if(e.util.isArray(o)){var u=o;o=e.util.createBuffer();for(var a=0;a<u.length;++a)o.putByte(u[a])}var f=o.length();f>n.blockLength&&(n.start(),n.update(o.bytes()),o=n.digest()),r=e.util.createBuffer(),i=e.util.createBuffer(),f=o.length();for(var a=0;a<f;++a){var u=o.at(a);r.putByte(54^u),i.putByte(92^u)}if(f<n.blockLength){var u=n.blockLength-f;for(var a=0;a<u;++a)r.putByte(54),i.putByte(92)}t=o,r=r.bytes(),i=i.bytes()}n.start(),n.update(r)},s.update=function(e){n.update(e)},s.getMac=function(){var e=n.digest().bytes();return n.start(),n.update(i),n.update(e),n.digest()},s.digest=s.getMac,s}}var r="hmac";if(typeof n!="function"){if(typeof module!="object"||!module.exports)return typeof forge=="undefined"&&(forge={}),e(forge);var i=!0;n=function(e,n){n(t,module)}}var s,o=function(t,n){n.exports=function(n){var i=s.map(function(e){return t(e)}).concat(e);n=n||{},n.defined=n.defined||{};if(n.defined[r])return n[r];n.defined[r]=!0;for(var o=0;o<i.length;++o)i[o](n);return n[r]}},u=n;n=function(e,t){return s=typeof e=="string"?t.slice(2):e.slice(2),i?(delete n,u.apply(null,Array.prototype.slice.call(arguments,0))):(n=u,n.apply(null,Array.prototype.slice.call(arguments,0)))},n("js/hmac",["require","module","./md","./util"],function(){o.apply(null,Array.prototype.slice.call(arguments,0))})}(),function(){function e(e){var n=e.pkcs5=e.pkcs5||{},r=typeof process!="undefined"&&process.versions&&process.versions.node,i;r&&!e.disableNativeCode&&(i=t("crypto")),e.pbkdf2=n.pbkdf2=function(t,n,s,o,u,a){function w(){if(y>c)return a(null,d);p.start(null,null),p.update(n),p.update(e.util.int32ToBytes(y)),v=g=p.digest().getBytes(),b=2,E()}function E(){if(b<=s)return p.start(null,null),p.update(g),m=p.digest().getBytes(),v=e.util.xorBytes(v,m,f),g=m,++b,e.util.setImmediate(E);d+=y<c?v:v.substr(0,h),++y,w()}typeof u=="function"&&(a=u,u=null);if(r&&!e.disableNativeCode&&i.pbkdf2&&(u===null||typeof u!="object")&&(i.pbkdf2Sync.length>4||!u||u==="sha1"))return typeof u!="string"&&(u="sha1"),n=new Buffer(n,"binary"),a?i.pbkdf2Sync.length===4?i.pbkdf2(t,n,s,o,function(e,t){if(e)return a(e);a(null,t.toString("binary"))}):i.pbkdf2(t,n,s,o,u,function(e,t){if(e)return a(e);a(null,t.toString("binary"))}):i.pbkdf2Sync.length===4?i.pbkdf2Sync(t,n,s,o).toString("binary"):i.pbkdf2Sync(t,n,s,o,u).toString("binary");if(typeof u=="undefined"||u===null)u=e.md.sha1.create();if(typeof u=="string"){if(!(u in e.md.algorithms))throw new Error("Unknown hash algorithm: "+u);u=e.md[u].create()}var f=u.digestLength;if(o>4294967295*f){var l=new Error("Derived key is too long.");if(a)return a(l);throw l}var c=Math.ceil(o/f),h=o-(c-1)*f,p=e.hmac.create();p.start(u,t);var d="",v,m,g;if(!a){for(var y=1;y<=c;++y){p.start(null,null),p.update(n),p.update(e.util.int32ToBytes(y)),v=g=p.digest().getBytes();for(var b=2;b<=s;++b)p.start(null,null),p.update(g),m=p.digest().getBytes(),v=e.util.xorBytes(v,m,f),g=m;d+=y<c?v:v.substr(0,h)}return d}var y=1,b;w()}}var r="pbkdf2";if(typeof n!="function"){if(typeof module!="object"||!module.exports)return typeof forge=="undefined"&&(forge={}),e(forge);var i=!0;n=function(e,n){n(t,module)}}var s,o=function(t,n){n.exports=function(n){var i=s.map(function(e){return t(e)}).concat(e);n=n||{},n.defined=n.defined||{};if(n.defined[r])return n[r];n.defined[r]=!0;for(var o=0;o<i.length;++o)i[o](n);return n[r]}},u=n;n=function(e,t){return s=typeof e=="string"?t.slice(2):e.slice(2),i?(delete n,u.apply(null,Array.prototype.slice.call(arguments,0))):(n=u,n.apply(null,Array.prototype.slice.call(arguments,0)))},n("js/pbkdf2",["require","module","./hmac","./md","./util"],function(){o.apply(null,Array.prototype.slice.call(arguments,0))})}(),function(){function e(e){var n=typeof process!="undefined"&&process.versions&&process.versions.node,r=null;!e.disableNativeCode&&n&&!process.versions["node-webkit"]&&(r=t("crypto"));var i=e.prng=e.prng||{};i.create=function(t){function u(e){if(n.pools[0].messageLength>=32)return f(),e();var t=32-n.pools[0].messageLength<<5;n.seedFile(t,function(t,r){if(t)return e(t);n.collect(r),f(),e()})}function a(){if(n.pools[0].messageLength>=32)return f();var e=32-n.pools[0].messageLength<<5;n.collect(n.seedFileSync(e)),f()}function f(){var e=n.plugin.md.create();e.update(n.pools[0].digest().getBytes()),n.pools[0].start();var t=1;for(var r=1;r<32;++r)t=t===31?2147483648:t<<2,t%n.reseeds===0&&(e.update(n.pools[r].digest().getBytes()),n.pools[r].start());var i=e.digest().getBytes();e.start(),e.update(i);var s=e.digest().getBytes();n.key=n.plugin.formatKey(i),n.seed=n.plugin.formatSeed(s),n.reseeds=n.reseeds===4294967295?0:n.reseeds+1,n.generated=0}function l(t){var n=null;if(typeof window!="undefined"){var r=window.crypto||window.msCrypto;r&&r.getRandomValues&&(n=function(e){return r.getRandomValues(e)})}var i=e.util.createBuffer();if(n)while(i.length()<t){var s=Math.max(1,Math.min(t-i.length(),65536)/4),o=new Uint32Array(Math.floor(s));try{n(o);for(var u=0;u<o.length;++u)i.putInt32(o[u])}catch(a){if(!(typeof QuotaExceededError!="undefined"&&a instanceof QuotaExceededError))throw a}}if(i.length()<t){var f,l,c,h=Math.floor(Math.random()*65536);while(i.length()<t){l=16807*(h&65535),f=16807*(h>>16),l+=(f&32767)<<16,l+=f>>15,l=(l&2147483647)+(l>>31),h=l&4294967295;for(var u=0;u<3;++u)c=h>>>(u<<3),c^=Math.floor(Math.random()*256),i.putByte(String.fromCharCode(c&255))}}return i.getBytes(t)}var n={plugin:t,key:null,seed:null,time:null,reseeds:0,generated:0},i=t.md,s=new Array(32);for(var o=0;o<32;++o)s[o]=i.create();return n.pools=s,n.pool=0,n.generate=function(t,r){function l(c){if(c)return r(c);if(f.length()>=t)return r(null,f.getBytes(t));n.generated>1048575&&(n.key=null);if(n.key===null)return e.util.nextTick(function(){u(l)});var h=i(n.key,n.seed);n.generated+=h.length,f.putBytes(h),n.key=o(i(n.key,s(n.seed))),n.seed=a(i(n.key,n.seed)),e.util.setImmediate(l)}if(!r)return n.generateSync(t);var i=n.plugin.cipher,s=n.plugin.increment,o=n.plugin.formatKey,a=n.plugin.formatSeed,f=e.util.createBuffer();n.key=null,l()},n.generateSync=function(t){var r=n.plugin.cipher,i=n.plugin.increment,s=n.plugin.formatKey,o=n.plugin.formatSeed;n.key=null;var u=e.util.createBuffer();while(u.length()<t){n.generated>1048575&&(n.key=null),n.key===null&&a();var f=r(n.key,n.seed);n.generated+=f.length,u.putBytes(f),n.key=s(r(n.key,i(n.seed))),n.seed=o(r(n.key,n.seed))}return u.getBytes(t)},r?(n.seedFile=function(e,t){r.randomBytes(e,function(e,n){if(e)return t(e);t(null,n.toString())})},n.seedFileSync=function(e){return r.randomBytes(e).toString()}):(n.seedFile=function(e,t){try{t(null,l(e))}catch(n){t(n)}},n.seedFileSync=l),n.collect=function(e){var t=e.length;for(var r=0;r<t;++r)n.pools[n.pool].update(e.substr(r,1)),n.pool=n.pool===31?0:n.pool+1},n.collectInt=function(e,t){var r="";for(var i=0;i<t;i+=8)r+=String.fromCharCode(e>>i&255);n.collect(r)},n.registerWorker=function(e){if(e===self)n.seedFile=function(e,t){function n(e){var r=e.data;r.forge&&r.forge.prng&&(self.removeEventListener("message",n),t(r.forge.prng.err,r.forge.prng.bytes))}self.addEventListener("message",n),self.postMessage({forge:{prng:{needed:e}}})};else{var t=function(t){var r=t.data;r.forge&&r.forge.prng&&n.seedFile(r.forge.prng.needed,function(t,n){e.postMessage({forge:{prng:{err:t,bytes:n}}})})};e.addEventListener("message",t)}},n}}var r="prng";if(typeof n!="function"){if(typeof module!="object"||!module.exports)return typeof forge=="undefined"&&(forge={}),e(forge);var i=!0;n=function(e,n){n(t,module)}}var s,o=function(t,n){n.exports=function(n){var i=s.map(function(e){return t(e)}).concat(e);n=n||{},n.defined=n.defined||{};if(n.defined[r])return n[r];n.defined[r]=!0;for(var o=0;o<i.length;++o)i[o](n);return n[r]}},u=n;n=function(e,t){return s=typeof e=="string"?t.slice(2):e.slice(2),i?(delete n,u.apply(null,Array.prototype.slice.call(arguments,0))):(n=u,n.apply(null,Array.prototype.slice.call(arguments,0)))},n("js/prng",["require","module","./md","./util"],function(){o.apply(null,Array.prototype.slice.call(arguments,0))})}(),function(){function e(e){if(e.random&&e.random.getBytes)return;(function(t){function s(){var t=e.prng.create(n);return t.getBytes=function(e,n){return t.generate(e,n)},t.getBytesSync=function(e){return t.generate(e)},t}var n={},r=new Array(4),i=e.util.createBuffer();n.formatKey=function(t){var n=e.util.createBuffer(t);return t=new Array(4),t[0]=n.getInt32(),t[1]=n.getInt32(),t[2]=n.getInt32(),t[3]=n.getInt32(),e.aes._expandKey(t,!1)},n.formatSeed=function(t){var n=e.util.createBuffer(t);return t=new Array(4),t[0]=n.getInt32(),t[1]=n.getInt32(),t[2]=n.getInt32(),t[3]=n.getInt32(),t},n.cipher=function(t,n){return e.aes._updateBlock(t,n,r,!1),i.putInt32(r[0]),i.putInt32(r[1]),i.putInt32(r[2]),i.putInt32(r[3]),i.getBytes()},n.increment=function(e){return++e[3],e},n.md=e.md.sha256;var o=s(),u=typeof process!="undefined"&&process.versions&&process.versions.node,a=null;if(typeof window!="undefined"){var f=window.crypto||window.msCrypto;f&&f.getRandomValues&&(a=function(e){return f.getRandomValues(e)})}if(e.disableNativeCode||!u&&!a){typeof window=="undefined"||window.document===undefined,o.collectInt(+(new Date),32);if(typeof navigator!="undefined"){var l="";for(var c in navigator)try{typeof navigator[c]=="string"&&(l+=navigator[c])}catch(h){}o.collect(l),l=null}t&&(t().mousemove(function(e){o.collectInt(e.clientX,16),o.collectInt(e.clientY,16)}),t().keypress(function(e){o.collectInt(e.charCode,8)}))}if(!e.random)e.random=o;else for(var c in o)e.random[c]=o[c];e.random.createInstance=s})(typeof jQuery!="undefined"?jQuery:null)}var r="random";if(typeof n!="function"){if(typeof module!="object"||!module.exports)return typeof forge=="undefined"&&(forge={}),e(forge);var i=!0;n=function(e,n){n(t,module)}}var s,o=function(t,n){n.exports=function(n){var i=s.map(function(e){return t(e)}).concat(e);n=n||{},n.defined=n.defined||{};if(n.defined[r])return n[r];n.defined[r]=!0;for(var o=0;o<i.length;++o)i[o](n);return n[r]}},u=n;n=function(e,t){return s=typeof e=="string"?t.slice(2):e.slice(2),i?(delete n,u.apply(null,Array.prototype.slice.call(arguments,0))):(n=u,n.apply(null,Array.prototype.slice.call(arguments,0)))},n("js/random",["require","module","./aes","./md","./prng","./util"],function(){o.apply(null,Array.prototype.slice.call(arguments,0))})}(),function(){var e="forge";if(typeof n!="function"){if(typeof module!="object"||!module.exports){typeof forge=="undefined"&&(forge={disableNativeCode:!1});return}var r=!0;n=function(e,n){n(t,module)}}var i,s=function(t,n){n.exports=function(n){var r=i.map(function(e){return t(e)});n=n||{},n.defined=n.defined||{};if(n.defined[e])return n[e];n.defined[e]=!0;for(var s=0;s<r.length;++s)r[s](n);return n},n.exports.disableNativeCode=!1,n.exports(n.exports)},o=n;n=function(e,t){return i=typeof e=="string"?t.slice(2):e.slice(2),r?(delete n,o.apply(null,Array.prototype.slice.call(arguments,0))):(n=o,n.apply(null,Array.prototype.slice.call(arguments,0)))},n("js/forge",["require","module","./aes","./cipher","./md","./pbkdf2","./random","./util"],function(){s.apply(null,Array.prototype.slice.call(arguments,0))})}(),t("js/forge")});
// from 'src/linky.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var cache, contains, endsWith, examine, pairs, tlds;

  window.linkify = {};

  tlds = 'abbott abogado ac academy accountants active actor ad adult ae aero af ag agency ai airforce al allfinanz alsace am amsterdam an android ao apartments aq aquarelle ar archi army arpa as asia associates at attorney au auction audio autos aw ax axa az ba band bank bar barclaycard barclays bargains bayern bb bd be beer berlin best bf bg bh bi bid bike bingo bio biz bj black blackfriday bloomberg blue bm bmw bn bnpparibas bo boats boo boutique br brussels bs bt budapest build builders business buzz bv bw by bz bzh ca cab cal camera camp cancerresearch canon capetown capital caravan cards care career careers cartier casa cash casino cat catering cbn cc cd center ceo cern cf cg ch channel chat cheap chloe christmas chrome church ci citic city ck cl claims cleaning click clinic clothing club cm cn co coach codes coffee college cologne com community company computer condos construction consulting contractors cooking cool coop country courses cr credit creditcard cricket crs cruises cu cuisinella cv cw cx cy cymru cz dabur dad dance dating datsun day dclk de deals degree delivery democrat dental dentist desi design dev diamonds diet digital direct directory discount dj dk dm dnp do docs domains doosan durban dvag dz eat ec edu education ee eg email emerck energy engineer engineering enterprises epson equipment er erni es esq estate et eu eurovision eus events everbank exchange expert exposed fail fans farm fashion feedback fi finance financial firmdale fish fishing fit fitness fj fk flights florist flowers flsmidth fly fm fo foo football forex forsale foundation fr frl frogans fund furniture futbol ga gal gallery garden gb gbiz gd gdn ge gent gf gg ggee gh gi gift gifts gives gl glass gle global globo gm gmail gmo gmx gn goldpoint goo goog google gop gov gp gq gr graphics gratis green gripe gs gt gu guide guitars guru gw gy hamburg hangout haus healthcare help here hermes hiphop hiv hk hm hn holdings holiday homes horse host hosting house how hr ht hu ibm id ie ifm il im immo immobilien in industries infiniti info ing ink institute insure int international investments io iq ir irish is it iwc java jcb je jetzt jm jo jobs joburg jp juegos kaufen kddi ke kg kh ki kim kitchen kiwi km kn koeln kp kr krd kred kw ky kyoto kz la lacaixa land lat latrobe lawyer lb lc lds lease leclerc legal lgbt li lidl life lighting limited limo link lk loans london lotte lotto lr ls lt ltda lu luxe luxury lv ly ma madrid maif maison management mango market marketing markets marriott mc md me media meet melbourne meme memorial menu mg mh miami mil mini mk ml mm mn mo mobi moda moe monash money mormon mortgage moscow motorcycles mov mp mq mr ms mt mtpc mu museum mv mw mx my mz na nagoya name navy nc ne net network neustar new nexus nf ng ngo nhk ni nico ninja nissan nl no np nr nra nrw ntt nu nyc nz okinawa om one ong onl ooo oracle org organic osaka otsuka ovh pa paris partners parts party pe pf pg ph pharmacy photo photography photos physio pics pictet pictures pink pizza pk pl place plumbing pm pn pohl poker porn post pr praxi press pro prod productions prof properties property ps pt pub pw py qa qpon quebec re realtor recipes red rehab reise reisen reit ren rentals repair report republican rest restaurant reviews rich rio rip ro rocks rodeo rs rsvp ru ruhr rw ryukyu sa saarland sale samsung sarl saxo sb sc sca scb schmidt school schule schwarz science scot sd se services sew sexy sg sh shiksha shoes shriram si singles sj sk sky sl sm sn so social software sohu solar solutions soy space spiegel sr st study style su sucks supplies supply support surf surgery suzuki sv sx sy sydney systems sz taipei tatar tattoo tax tc td technology tel temasek tennis tf tg th tienda tips tires tirol tj tk tl tm tn to today tokyo tools top toshiba town toys tr trade training travel trust tt tui tv tw tz ua ug uk university uno uol us uy uz va vacations vc ve vegas ventures versicherung vet vg vi viajes video villas vision vlaanderen vn vodka vote voting voto voyage vu wales wang watch webcam website wed wedding wf whoswho wien wiki williamhill wme work works world ws wtc wtf xin xn--1qqw23a xn--3bst00m xn--3ds443g xn--3e0b707e xn--45brj9c xn--45q11c xn--4gbrim xn--55qw42g xn--55qx5d xn--6frz82g xn--6qq986b3xl xn--80adxhks xn--80ao21a xn--80asehdb xn--80aswg xn--90a3ac xn--90ais xn--b4w605ferd xn--c1avg xn--cg4bki xn--clchc0ea0b2g2a9gcd xn--czr694b xn--czrs0t xn--czru2d xn--d1acj3b xn--d1alf xn--fiq228c5hs xn--fiq64b xn--fiqs8s xn--fiqz9s xn--flw351e xn--fpcrj9c3d xn--fzc2c9e2c xn--gecrj9c xn--h2brj9c xn--hxt814e xn--i1b6b1a6a2e xn--io0a7i xn--j1amh xn--j6w193g xn--kprw13d xn--kpry57d xn--kput3i xn--l1acc xn--lgbbat1ad8j xn--mgb9awbf xn--mgba3a4f16a xn--mgbaam7a8h xn--mgbab2bd xn--mgbayh7gpa xn--mgbbh1a71e xn--mgbc0a9azcg xn--mgberp4a5d4ar xn--mgbx4cd0ab xn--mxtq1m xn--ngbc5azd xn--node xn--nqv7f xn--nqv7fs00ema xn--o3cw4h xn--ogbpf8fl xn--p1acf xn--p1ai xn--pgbs0dh xn--q9jyb4c xn--qcka1pmc xn--rhqv96g xn--s9brj9c xn--ses554g xn--unup4y xn--vermgensberater-ctb xn--vermgensberatung-pwb xn--vhquv xn--wgbh1c xn--wgbl6a xn--xhq521b xn--xkc2al3hye2a xn--xkc2dl3a5ee0h xn--yfro4i67o xn--ygbi2ammx xn--zfr164b xxx xyz yachts yandex ye yodobashi yoga yokohama youtube yt za zip zm zone zuerich zw'.split(" ");

  pairs = [["(", ")"], ["[", "]"], ["{", "}"], ["'", "'"], ['"', '"']];

  endsWith = function(text, str) {
    return text.slice(text.length - str.length) === str;
  };

  contains = function(text, str) {
    return text.indexOf(str) !== -1;
  };

  cache = {};

  linkify.linkify = function(text) {
    var j, len, output, parts, t;
    if (cache[text] != null) {
      return cache[text];
    }
    parts = linkify.analyze(text);
    output = "";
    for (j = 0, len = parts.length; j < len; j++) {
      t = parts[j];
      if (t[0] === "url") {
        output += "<a href='" + t[1] + "' target='_blank'>" + t[2] + "</a>";
      } else {
        output += t;
      }
    }
    cache[text] = output;
    return output;
  };

  linkify.analyze = function(text) {
    var i, j, k, l, len, len1, len2, len3, m, output, r, ref, result, t, tld, token, tokens, v;
    ref = [["&", "&amp;"], ["<", "&lt;"], [">", "&gt;"]];
    for (j = 0, len = ref.length; j < len; j++) {
      v = ref[j];
      text = text.replace(new RegExp(v[0], "gm"), v[1]);
    }
    tokens = text.split(/(\s+)/);
    output = [];
    for (i = k = 0, len1 = tokens.length; k < len1; i = ++k) {
      token = tokens[i];
      r = token;
      t = token.toLowerCase();
      for (l = 0, len2 = tlds.length; l < len2; l++) {
        tld = tlds[l];
        if (contains(t, "." + tld)) {
          result = examine(token, tld);
          if (result) {
            for (m = 0, len3 = result.length; m < len3; m++) {
              r = result[m];
              output.push(r);
            }
            r = "";
            break;
          }
        }
      }
      output.push(r);
    }
    return output;
  };

  examine = function(t, tld) {
    var a, b, j, len, post, pre, ref, url;
    pre = "";
    post = "";
    if (t[t.length - 1] === ".") {
      post = "." + post;
      t = t.slice(0, t.length - 1);
    }
    for (j = 0, len = pairs.length; j < len; j++) {
      ref = pairs[j], a = ref[0], b = ref[1];
      if (t[0] === a && t[t.length - 1] === b) {
        pre = pre + a;
        post = b + post;
        t = t.slice(1, t.length - 1);
      }
    }
    if (!(endsWith(t, "." + tld) || contains(t, "." + tld + "/") || contains(t, "." + tld + ":"))) {
      return false;
    }
    if (t[0] === ".") {
      return false;
    }
    if (t.slice(0, 4) !== "http") {
      url = "http://" + t;
    } else {
      url = t;
    }
    return [pre, ["url", url, t], post];
  };

}).call(this);

//# sourceMappingURL=linky.js.map

// from 'src/onecup.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var CSS_PROPS, HTML_TAGS, IE, JS_EVENT, check_selectors, css, css_chain, css_def, css_rule_chain, current_rule, current_tag, dom_build, dom_scan, dont_refresh_flag, dont_refresh_this_time, full_refresh, inserted, j, js_event, l, len, len1, len2, levels, m, make_css, make_event, make_selectors, make_tag, needs_refresh_flag, old_oml, parse_selectors, parse_url, redraw, render, requestAnimationFrame, setup_new_window, tag, tag_add, tag_build, tag_chain, tag_remove, tag_replace, tag_scan, tags, visibilitychange,
    slice = [].slice;

  window.onecup = {};

  HTML_TAGS = "a\naudio\nb\nblockquote\nbr\nbutton\ncanvas\ncode\ndiv\nem\nembed\nform\nh1\nh2\nh3\nh4\nh5\nh6\nheader\nhr\ni\niframe\nimg\ninput\nlabel\nli\nobject\nol\noption\np\npre\nscript\nselect\nsmall\nsource\nspan\nstrong\nsub\nsup\ntable\ntbody\ntd\ntextarea\ntfoot\nth\nthead\ntime\ntr\nu\nul\nvideo".split(/\s/);

  CSS_PROPS = "align_items\nbackground\nbackground_attachment\nbackground_color\nbackground_image\nbackground_size\nbackground_position\nbackground_position_x\nbackground_position_y\nbackground_repeat\nborder\nborder_bottom\nborder_bottom_color\nborder_bottom_style\nborder_bottom_width\nborder_collapse\nborder_color\nborder_left\nborder_left_color\nborder_left_style\nborder_left_width\nborder_radius\nborder_right\nborder_right_color\nborder_right_style\nborder_right_width\nborder_spacing\nborder_style\nborder_top\nborder_top_color\nborder_top_style\nborder_top_width\nborder_width\nbottom\nbox_shadow\nclear\nclip\ncolor\ncursor\ndirection\ndisplay\nflex\nflex_direction\nflex_wrap\nfloat\nfont\nfont_family\nfont_size\nfont_size_adjust\nfont_stretch\nfont_style\nfont_variant\nfont_weight\nheight\njustify_content\nleft\nline_break\nline_height\nlist_style\nlist_style_image\nlist_style_position\nlist_style_type\nmargin\nmargin_bottom\nmargin_left\nmargin_right\nmargin_top\nmarker_offset\nmax_height\nmax_width\nmin_height\nmin_width\nopacity\noverflow\noverflow_x\noverflow_y\npadding\npadding_bottom\npadding_left\npadding_right\npadding_top\nposition\nright\ntable_layout\ntext_align\ntext_align_last\ntext_decoration\ntext_indent\ntext_justify\ntext_overflow\ntext_shadow\ntext_transform\ntext_autospace\ntext_kashida_space\ntext_underline_position\ntop\ntransform\ntransition\nvertical_align\nvisibility\nwhite_space\nwidth\nword_break\nword_spacing\nword_wrap\nz_index\nzoom".split(/\s/);

  JS_EVENT = "onblur\nonchange\noncontextmenu\nonfocus\noninput\nonselect\nonsubmit\nonkeydown\nonkeypress\nonkeyup\nonclick\nondblclick\nondrag\nondragend\nondragenter\nondragleave\nondragover\nondragstart\nondrop\nonmouseenter\nonmousedown\nonmousemove\nonmouseout\nonmouseover\nonmouseup\nonload\nonscroll\nonwheel".split(/\s/);

  IE = navigator.msMaxTouchPoints;

  if (Array.isArray == null) {
    Array.isArray = function(obj) {
      return Object.prototype.toString.call(obj) === '[object Array]';
    };
  }

  onecup.new_page = function() {};

  current_tag = null;

  tag_chain = [];

  css_chain = [];

  css_rule_chain = [];

  current_rule = null;

  levels = [];

  tags = [];

  old_oml = null;

  full_refresh = true;

  dont_refresh_flag = false;

  render = function() {
    var finished_tags;
    finished_tags = tags;
    tags = [];
    return finished_tags;
  };

  check_selectors = function(args) {
    var first_arg;
    first_arg = args[0];
    if (typeof first_arg === 'string') {
      if ("#" === first_arg[0] || "." === first_arg[0]) {
        return parse_selectors(args.shift());
      }
    }
    return {};
  };

  parse_selectors = function(arg) {
    var attributes, classes, i, j, len, ref;
    attributes = {};
    classes = [];
    ref = arg.split('.');
    for (j = 0, len = ref.length; j < len; j++) {
      i = ref[j];
      if (i.length === 0) {
        continue;
      } else if ("#" === i[0]) {
        if (attributes.id) {
          throw Error("mulitple ids " + arg);
        }
        attributes.id = i.slice(1);
      } else {
        classes.push(i);
      }
    }
    if (classes.length > 0) {
      attributes["class"] = classes.join(" ");
    }
    return attributes;
  };

  make_selectors = function(attrs) {
    var selector;
    selector = "";
    if (attrs.id) {
      selector += "#" + attrs.id;
    }
    if (attrs["class"]) {
      selector += "." + attrs["class"].split(" ").join(".");
    }
    return selector;
  };

  css_def = function(css) {
    var k, lines, v;
    if (typeof css !== 'object') {
      return css;
    }
    lines = [];
    for (k in css) {
      v = css[k];
      if (typeof v === 'number') {
        v = v + "px";
      }
      lines.push(k + ":" + v);
    }
    return lines.join(";");
  };

  make_tag = function(tag_name) {
    return function() {
      var arg, args, attributes, inner_fn, inner_tags, j, k, len, newv, this_tag, v;
      args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
      attributes = check_selectors(args);
      if (typeof args[args.length - 1] === 'function') {
        inner_fn = args.pop();
      }
      for (j = 0, len = args.length; j < len; j++) {
        arg = args[j];
        if (typeof arg === 'object') {
          for (k in arg) {
            v = arg[k];
            if (typeof v === 'function') {
              newv = onecup.event_fn(v);
            } else if (typeof v === 'undefined') {
              continue;
            } else if (k === "style") {
              newv = v;
            } else {
              newv = v;
            }
            attributes[k] = newv;
          }
        } else {
          throw Error("invalid tag argument " + (JSON.stringify(arg)) + " of type " + (typeof arg) + " for <" + tag_name + ">");
        }
      }
      this_tag = {
        tag: tag_name,
        attrs: attributes,
        children: null
      };
      levels.push(tags);
      tags = inner_tags = [];
      current_tag = this_tag;
      tag_chain.push(current_tag);
      css_chain.push(make_selectors(current_tag.attrs));
      if (typeof inner_fn === "function") {
        inner_fn();
      }
      tags = levels.pop(tags);
      this_tag.children = inner_tags;
      if (this_tag.attrs.style != null) {
        this_tag.attrs.style = css_def(this_tag.attrs.style);
      }
      tag_chain.pop();
      css_chain.pop();
      current_tag = tag_chain[tag_chain.length - 1];
      return tags.push(this_tag);
    };
  };

  make_css = function(css_name) {
    var css_real_name;
    css_real_name = css_name.replace("_", "-").replace("_", "-");
    return function() {
      var args;
      args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
      if (current_rule) {
        current_rule[css_real_name] = args[0];
        return;
      }
      if (current_tag.attrs.style == null) {
        current_tag.attrs.style = {};
      }
      return current_tag.attrs.style[css_real_name] = args[0];
    };
  };

  make_event = function(js_name) {
    return function() {
      var args;
      args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
      return current_tag.attrs[js_name] = onecup.event_fn(args[0]);
    };
  };

  for (j = 0, len = HTML_TAGS.length; j < len; j++) {
    tag = HTML_TAGS[j];
    onecup[tag] = make_tag(tag);
  }

  for (l = 0, len1 = CSS_PROPS.length; l < len1; l++) {
    css = CSS_PROPS[l];
    onecup[css] = make_css(css);
  }

  for (m = 0, len2 = JS_EVENT.length; m < len2; m++) {
    js_event = JS_EVENT[m];
    onecup[js_event] = make_event(js_event);
  }

  onecup.text = function() {
    var args;
    args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
    return tags.push({
      special: "text",
      text: args.join("")
    });
  };

  onecup.raw = function() {
    var args;
    args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
    return tags.push({
      special: "raw",
      text: args.join("")
    });
  };

  onecup.nbsp = function(n) {
    var i, o, ref, results;
    if (n == null) {
      n = 1;
    }
    results = [];
    for (i = o = 0, ref = n; 0 <= ref ? o < ref : o > ref; i = 0 <= ref ? ++o : --o) {
      results.push(onecup.raw("&nbsp;"));
    }
    return results;
  };

  onecup.raw_img = onecup.img;

  onecup.img = function() {
    var a, args, kargs, len3, o, src;
    args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
    for (o = 0, len3 = args.length; o < len3; o++) {
      a = args[o];
      if (a.src != null) {
        kargs = a;
        break;
      }
    }
    if (!kargs) {
      console.error("Image without source", args);
      return;
    }
    src = kargs.src;
    if (window.devicePixelRatio !== 1 && src.indexOf(".png") !== -1 && src.slice(0, 4) !== "http") {
      kargs.src = src.replace(".png", "@2x.png");
    }
    if (window.devicePixelRatio !== 1 && src.indexOf(".jpg") !== -1 && src.slice(0, 4) !== "http") {
      kargs.src = src.replace(".jpg", "@2x.jpg");
    }
    return onecup.raw_img.apply(onecup, args);
  };

  inserted = {};

  onecup.css = function() {
    var args, fn, full_rule_selector, rule_body, rule_css, rule_selector;
    args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
    if (args.length === 2) {
      rule_selector = args[0], fn = args[1];
    } else {
      rule_selector = "";
      fn = args[0];
    }
    if (rule_selector[0] === ":") {
      full_rule_selector = css_chain.join(" ") + rule_selector;
    } else {
      full_rule_selector = css_chain.join(" ") + " " + rule_selector;
    }
    css_chain.push(rule_selector);
    css_rule_chain.push(current_rule);
    current_rule = {};
    fn();
    rule_body = css_def(current_rule);
    current_rule = null;
    if (rule_body) {
      rule_css = full_rule_selector + " {" + rule_body + "}";
      if (inserted[rule_css] !== true) {
        inserted[rule_css] = true;
        document.styleSheets[0].insertRule(rule_css, 0);
      }
    }
    css_chain.pop();
    return current_rule = css_rule_chain.pop();
  };

  onecup["import"] = function() {
    var all, k;
    all = [];
    for (k in onecup) {
      if (k !== "import") {
        all.push(k + " = onecup." + k);
      }
    }
    return "var " + all.join(", ") + ";";
  };

  redraw = function(time) {
    var e, error, error1, fn, len3, new_oml, o, ref, results;
    onecup.fn_count = 0;
    onecup.params = parse_url();
    onecup.post_render_fns = [];
    if (!onecup.body) {
      try {
        onecup.body = document.getElementById('onecup');
        if (!onecup.body && document.body) {
          onecup.body = document.body.innerHTML += "<div id='onecup'></div>";
        } else {
          onecup.after(refresh);
          return;
        }
      } catch (error) {
        e = error;
        onecup.after(refresh);
      }
    }
    try {
      if (typeof window.body === "function") {
        window.body();
      }
    } catch (error1) {
      e = error1;
      tags = [];
      if (typeof window.error_body === "function") {
        window.error_body(e);
      }
    }
    new_oml = render();
    if (!full_refresh && old_oml) {
      dom_scan(onecup.body, new_oml, old_oml);
    } else {
      onecup.body.innerHTML = '';
      dom_build(onecup.body, new_oml);
      full_refresh = false;
    }
    old_oml = new_oml;
    ref = onecup.post_render_fns;
    results = [];
    for (o = 0, len3 = ref.length; o < len3; o++) {
      fn = ref[o];
      results.push(fn());
    }
    return results;
  };

  onecup.post_render = function(fn) {
    return onecup.post_render_fns.push(fn);
  };

  dom_build = function(parent, oml) {
    var elm, len3, o;
    for (o = 0, len3 = oml.length; o < len3; o++) {
      elm = oml[o];
      tag_build(elm);
      tag_add(parent, elm);
    }
  };

  tag_add = function(parent, elm) {
    var dom, len3, o, ref, results;
    if (!(parent != null ? parent.appendChild : void 0)) {
      return;
    }
    elm.parentNode = parent;
    if (elm.dom != null) {
      parent.appendChild(elm.dom);
    }
    if (elm.doms != null) {
      ref = elm.doms;
      results = [];
      for (o = 0, len3 = ref.length; o < len3; o++) {
        dom = ref[o];
        results.push(parent.appendChild(dom));
      }
      return results;
    }
  };

  tag_build = function(elm) {
    var child, dom, k, len3, o, ref, ref1, v;
    if (elm.special === "raw") {
      dom = document.createElement("span");
      dom.innerHTML = elm.text;
      elm.doms = [];
      ref = dom.childNodes;
      for (o = 0, len3 = ref.length; o < len3; o++) {
        child = ref[o];
        elm.doms.push(child);
      }
      if (elm.doms.length === 0) {
        elm.doms.push(document.createTextNode(""));
      }
    } else if (elm.special === "text") {
      dom = document.createTextNode(elm.text);
      elm.dom = dom;
    } else {
      dom = document.createElement(elm.tag);
      elm.dom = dom;
      ref1 = elm.attrs;
      for (k in ref1) {
        v = ref1[k];
        if (Array.isArray(v)) {
          v = v.join(" ");
        }
        dom.setAttribute(k, v);
      }
      if (elm.children) {
        dom_build(dom, elm.children);
      }
    }
  };

  dom_scan = function(parent, as, bs) {
    var elm, i, o, p, q, ref, ref1, ref2, ref3, ref4, scan_length;
    if ((as == null) && (bs == null)) {
      return;
    } else if (as == null) {
      parent.innerHTML = '';
    } else if (bs == null) {
      dom_build(parent, as);
    } else {
      if (as.length < bs.length) {
        for (i = o = ref = as.length, ref1 = bs.length; ref <= ref1 ? o < ref1 : o > ref1; i = ref <= ref1 ? ++o : --o) {
          tag_remove(bs[i]);
        }
        scan_length = as.length;
      } else {
        scan_length = bs.length;
      }
      for (i = p = 0, ref2 = scan_length; 0 <= ref2 ? p < ref2 : p > ref2; i = 0 <= ref2 ? ++p : --p) {
        tag_scan(as[i], bs[i]);
      }
      if (as.length > bs.length) {
        for (i = q = ref3 = bs.length, ref4 = as.length; ref3 <= ref4 ? q < ref4 : q > ref4; i = ref3 <= ref4 ? ++q : --q) {
          elm = as[i];
          tag_build(elm);
          tag_add(parent, elm);
        }
      }
    }
  };

  tag_scan = function(a, b) {
    var k, ref, ref1, v;
    if (b == null) {
      throw "no tag b";
    } else if ((a.special != null) || (b.special != null)) {
      if (a.special !== b.special || a.text !== b.text) {
        tag_build(a);
        tag_replace(a, b);
      } else {
        if (b.dom != null) {
          a.dom = b.dom;
        } else if (b.doms != null) {
          a.doms = b.doms;
        } else {
          throw "b has no doms";
        }
      }
    } else if (a.tag !== b.tag) {
      tag_build(a);
      tag_replace(a, b);
    } else if (a.attrs.id !== b.attrs.id) {
      tag_build(a);
      tag_replace(a, b);
    } else {
      a.dom = b.dom;
      ref = a.attrs;
      for (k in ref) {
        v = ref[k];
        if (v !== b.attrs[k]) {
          if (k === 'value' && document.activeElement !== a.dom) {
            a.dom.value = v;
          } else if (k === 'style' && IE) {
            a.dom.removeAttribute(k);
            a.dom.setAttribute(k, v);
          } else if (k === 'src') {
            a.dom.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs%3D";
            a.dom.src = v;
          } else {
            a.dom.setAttribute(k, v);
          }
        }
      }
      ref1 = b.attrs;
      for (k in ref1) {
        v = ref1[k];
        if (a.attrs[k] == null) {
          a.dom.removeAttribute(k);
        }
      }
      dom_scan(a.dom, a.children, b.children);
    }
  };

  tag_replace = function(a, b) {
    var b_dom, dom, len3, o, parent, ref;
    if (b.dom != null) {
      b_dom = b.dom;
    } else if (b.doms != null) {
      b_dom = b.doms[0];
    } else {
      throw "element b not created";
    }
    parent = b_dom.parentNode;
    if (parent == null) {
      parent = b.parentNode;
      tag_add(parent, a);
      return;
    }
    if (a.dom != null) {
      parent.insertBefore(a.dom, b_dom);
      a.parentNode = parent;
    } else if (a.doms != null) {
      ref = a.doms;
      for (o = 0, len3 = ref.length; o < len3; o++) {
        dom = ref[o];
        parent.insertBefore(dom, b_dom);
      }
      a.parentNode = parent;
    } else {
      throw "element a not created yet";
    }
    return tag_remove(b);
  };

  tag_remove = function(b) {
    var dom, len3, o, parent, ref;
    if (b.dom != null) {
      parent = b.dom.parentNode;
      if (parent) {
        parent.removeChild(b.dom);
      }
    } else if (b.doms != null) {
      parent = b.doms[0].parentNode;
      ref = b.doms;
      for (o = 0, len3 = ref.length; o < len3; o++) {
        dom = ref[o];
        parent.removeChild(dom);
      }
    }
  };

  parse_url = function() {
    var params;
    if (window.location == null) {
      return {};
    }
    params = window.location.search.slice(1);
    return onecup.parse_query_string(params);
  };

  onecup.parse_query_string = function(params) {
    var args, k, len3, o, pair, ref, ref1, v;
    args = {};
    ref = params.split("&");
    for (o = 0, len3 = ref.length; o < len3; o++) {
      pair = ref[o];
      if (!pair) {
        continue;
      }
      ref1 = pair.split("="), k = ref1[0], v = ref1[1];
      if (v) {
        args[k] = unescape(decodeURI(v.replace(/\+/g, " ")));
      }
    }
    return args;
  };

  onecup.mk_url = function(base, params) {
    var key, part, parts, url, value;
    url = base;
    parts = (function() {
      var results;
      results = [];
      for (key in params) {
        value = params[key];
        part = "";
        part += key;
        part += "=";
        part += encodeURIComponent(value);
        results.push(part);
      }
      return results;
    })();
    if (parts.length > 0 && url[url.length - 1] !== "?") {
      url += "?";
    }
    return url + parts.join("&");
  };

  onecup.lookup = function(selector) {
    var selectorType;
    selectorType = 'querySelectorAll';
    if (selector.indexOf('#') === 0) {
      selectorType = 'getElementById';
      selector = selector.substr(1, selector.length);
    }
    return document[selectorType](selector);
  };

  setup_new_window = function() {
    onecup.new_page();
    return refresh();
  };

  onecup.goto = window.goto = function(url) {
    track("goto", {
      url: url
    });
    if (url.substr(0, 4) === "http" || url.substr(0, 7) === "mailto:") {
      window.location = url;
      return;
    }
    if (window.self !== window.top) {
      window.open(url);
      return;
    }
    if (window.history.pushState) {
      window.history.pushState("", url, url);
    } else {
      if (window.location.pathname === "/" && url.slice(0, 2) === "/#") {
        window.location.hash = url.slice(2);
      } else {
        window.location = url;
      }
    }
    return setup_new_window();
  };

  window.onpopstate = function(event) {
    onecup.scroll_top();
    return setup_new_window();
  };

  onecup.scroll_top = function() {
    var error;
    try {
      return window.scrollTo(0, 0);
    } catch (error) {
      return track("scroll_error");
    }
  };

  window.current_view = null;

  window.last_view_params = null;

  window.with_view = function(view_name, params) {
    var ref;
    if (view_name !== window.current_view) {
      if ((ref = window.last_view_params) != null) {
        if (typeof ref.exit === "function") {
          ref.exit();
        }
      }
      if (params != null) {
        if (typeof params.enter === "function") {
          params.enter();
        }
      }
      window.current_view = view_name;
      refresh();
    }
    return window.last_view_params = params;
  };

  onecup.on_click = function(event) {
    var href, target;
    if (event.ctrlKey || event.metaKey || event.altKey || event.button === 1) {
      return;
    }
    target = event.target;
    href = target.getAttribute("href");
    while (!href) {
      target = target.parentNode;
      if (target.getAttribute == null) {
        return;
      }
      href = target.getAttribute("href");
    }
    if (typeof target.onclick === "function") {
      target.onclick();
    }
    if (href.substr(0, 4) !== "http" && !target.getAttribute("target")) {
      goto(href);
      refresh();
      event.preventDefault();
    } else {
      if (target.target == null) {
        track("exit", {
          url: href
        });
        window.location = href;
      } else {
        track("new_window", {
          url: href
        });
      }
    }
    event.stopPropagation();
  };

  window.addEventListener("click", onecup.on_click, true);

  onecup.on_submit = function(event) {
    event.preventDefault();
    return event.stopPropagation();
  };

  window.addEventListener("submit", onecup.on_submit, true);

  window._handler = {};

  onecup.fn_count = 0;

  onecup.event_fn = function(fn) {
    var str_fn;
    str_fn = "window._handler[" + onecup.fn_count + "].apply(null, arguments);";
    window._handler[onecup.fn_count] = function() {
      onecup.track_error.apply(onecup, [fn].concat(slice.call(arguments)));
      return refresh();
    };
    onecup.fn_count += 1;
    return str_fn;
  };

  requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame || function(callback) {
    return window.setTimeout(callback, 17);
  };

  onecup.after = function(fn) {
    var wrap_fn;
    wrap_fn = function() {
      fn();
      return refresh();
    };
    return setTimeout(wrap_fn, 1);
  };

  onecup.later = function(ms, fn) {
    var wrap_fn;
    wrap_fn = function() {
      fn();
      return refresh();
    };
    return setTimeout(wrap_fn, ms);
  };

  needs_refresh_flag = false;

  dont_refresh_this_time = false;

  window.refresh = onecup.refresh = function() {
    var tick;
    if (dont_refresh_this_time) {
      dont_refresh_this_time = false;
      return;
    }
    if (needs_refresh_flag === false) {
      needs_refresh_flag = true;
      tick = function() {
        needs_refresh_flag = false;
        return onecup.track_error(redraw);
      };
      return requestAnimationFrame(tick, 0);
    }
  };

  onecup.no_refresh = function() {
    return dont_refresh_this_time = true;
  };

  onecup.track_error = function() {
    var args, e, error, fn;
    fn = arguments[0], args = 2 <= arguments.length ? slice.call(arguments, 1) : [];
    try {
      return fn.apply(null, args);
    } catch (error) {
      e = error;
      return track('error', {
        stack: e.stack,
        message: "" + e
      });
    }
  };

  window.onresize = function() {
    return refresh();
  };

  visibilitychange = function() {
    return refresh();
  };

  document.addEventListener("visibilitychange", visibilitychange, false);

  onecup.after(refresh);

}).call(this);

//# sourceMappingURL=onecup.js.map

// from 'src/tracking.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var NUM_LOG_LINES, browser, dict_copy, old_conosle_log,
    slice = [].slice;

  window.tracking = {};

  NUM_LOG_LINES = 100;

  old_conosle_log = console.log;

  tracking.visual = true;

  tracking.log = [];

  dict_copy = function(d) {
    var k, newd, v;
    newd = {};
    for (k in d) {
      v = d[k];
      newd[k] = v;
    }
    return newd;
  };

  window.track = function(label, kargs) {
    var args, event, i, k, keys, len, ref, ref1, v, xhr;
    event = dict_copy(kargs);
    keys = (function() {
      var results;
      results = [];
      for (k in event) {
        results.push(k);
      }
      return results;
    })();
    keys.sort();
    args = [];
    for (i = 0, len = keys.length; i < len; i++) {
      k = keys[i];
      args.push(k + ":" + event[k]);
    }
    if (tracking.visual) {
      if (!pb.DEBUG || ((ref = pb.browser) != null ? ref.name : void 0) !== "Chrome") {
        if (typeof console.log === "function") {
          console.log.apply(console, [label].concat(slice.call(args)));
        }
      } else {
        console.log('%c%s%c %s', 'background: #3498DB; color: white; padding:2px', label, '', args.join("\n    "));
      }
    }
    if (event == null) {
      event = {};
    }
    event.name = label;
    tracking.log.push(event);
    if (tracking.log.length > NUM_LOG_LINES) {
      tracking.log = tracking.log.slice(-NUM_LOG_LINES);
    }
    if (event.name === "error_ajax") {
      return;
    }
    if (pb.account != null) {
      event.user_id = pb.account.id;
      event.user_iden = pb.account.iden;
    }
    if (pb.DEBUG) {
      event.debug = true;
    }
    event.session_id = pb.session_id;
    event.client_id = pb.client_id;
    event.client_type = "web";
    event.client_version = pb.VERSION;
    if (event.name === "error") {
      ref1 = pb.visit_info;
      for (k in ref1) {
        v = ref1[k];
        event[k] = v;
      }
      console.log(event);
    }
    event.name = "web_" + event.name;
    if (pb.LOG_SERVER) {
      xhr = new XMLHttpRequest();
      xhr.open("POST", pb.LOG_SERVER, true);
      xhr.send(JSON.stringify(event));
    }
    if (tracking.visual) {
      return typeof tracking.track_cb === "function" ? tracking.track_cb(event) : void 0;
    }
  };

  console.log = function() {
    var args;
    args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
    tracking.log.push(args.join(" "));
    while (tracking.log.length > 100) {
      tracking.log.shift();
    }
    return old_conosle_log.apply(console, arguments);
  };

  browser = function() {
    var M, N, tem, ua;
    ua = navigator.userAgent;
    N = navigator.appName;
    M = ua.match(/(opr|opera)\/([\d\.]*)/i);
    if (M) {
      return ["Opera", M[2]];
    }
    M = ua.match(/(opera|chrome|safari|firefox|msie|trident)\/?\s*([\d\.]+)/i) || [];
    M = M[2] ? [M[1], M[2]] : [N, navigator.appVersion, '-?'];
    if (M && (tem = ua.match(/version\/([\.\d]+)/i)) !== null) {
      M[2] = tem[1];
    }
    if (M[0] === "Trident") {
      M[0] = "IE";
      M[1] = "11.0";
    }
    if (M[0] === "MSIE") {
      M[0] = "IE";
    }
    if (M[0] === "OPR") {
      M[0] = "Opera";
    }
    return M;
  };

  tracking.get_visit_info = function() {
    var b, mobile, platform, ref, ref1;
    pb.client_id = pb.db.get_simple("client_id");
    if (pb.client_id == null) {
      pb.client_id = pb.rand_iden();
      pb.db.set_simple("client_id", pb.client_id);
    }
    b = browser();
    pb.browser = {
      name: b[0] || navigator.userAgent,
      version: b[1],
      mobile: mobile = window.orientation != null
    };
    platform = navigator.platform;
    if (navigator.userAgent.indexOf("Android") !== -1) {
      platform = "Android";
    }
    if (navigator.userAgent.indexOf("CrOS") !== -1) {
      platform = "ChromeOS";
    }
    return {
      path: (ref = window.location) != null ? ref.pathname : void 0,
      referrer: document.referrer,
      referrer_domain: typeof document !== "undefined" && document !== null ? (ref1 = document.referrer.match(/https?:\/\/([^\/]*)/)) != null ? ref1[1] : void 0 : void 0,
      browser_name: pb.browser.name,
      browser_version: pb.browser.version,
      browser_mobile: pb.browser.mobile,
      user_agent: navigator.userAgent,
      platform: platform,
      language: navigator.language,
      encryption: pb.db.get('e2ePassword') !== ""
    };
  };

  tracking.visit = function(event_name) {
    pb.visit_info = tracking.get_visit_info();
    return track(event_name, pb.visit_info);
  };

  window.choose = function(list) {
    return list[Math.floor(list.length * Math.random())];
  };

  window.ab = {};

  ab.tracked = {};

  ab.test = function(name, options) {
    var option;
    option = pb.db.get("abtest_" + name);
    if (!option) {
      option = choose(options);
      pb.db.set("abtest_" + name, option);
    }
    if (!ab.tracked[name]) {
      track("ab_test", {
        type: name,
        option: option
      });
      ab.tracked[name] = true;
    }
    return option;
  };

  ab.option = function(name) {
    return pb.db.get("abtest_" + name);
  };

  ab.clear = function() {
    var k;
    for (k in localStorage) {
      if (k.slice(0, 7) === "abtest_") {
        localStorage.removeItem(k);
      }
    }
    return refresh();
  };

}).call(this);

// from 'src/pushbullet.js'
// Generated by CoffeeScript 1.10.0
(function() {
  if (self !== top && (typeof location !== "undefined" && location !== null ? location.pathname : void 0) !== "/widget.html") {
    if (location.origin !== top.location.origin) {
      document.write("Inside iframe please contact us if you are supirsed by this statement");
      throw "Inside iframe";
    }
  }

  window.pb = {};

  pb.VERSION = 162;

  if (location.host === "www.pushbullet.com") {
    pb.DEBUG = false;
    pb.API_SERVER = "https://api.pushbullet.com";
    pb.LOG_SERVER = "https://ocelot.pushbullet.com";
    pb.AUTH_REDIRECT_URI = "https://www.pushbullet.com/";
  } else if (location.host === "hippo.pushbullet.com") {
    pb.DEBUG = true;
    pb.API_SERVER = "https://api.pushbullet.com";
    pb.LOG_SERVER = null;
    pb.AUTH_REDIRECT_URI = "http://localhost:8000/";
  } else {
    pb.DEBUG = true;
    pb.API_SERVER = "https://api.pushbullet.com";
    pb.LOG_SERVER = null;
    pb.LOG_SERVER = "https://ocelot.pushbullet.com";
    pb.AUTH_REDIRECT_URI = "http://localhost:8000/";
  }

  pb.rand_iden = function() {
    return Math.random().toString(32).slice(2) + Math.random().toString(32).slice(2);
  };

  pb.in_frame = false;

  onecup.new_page = function() {
    return pb.account_drop = false;
  };

  window.onerror = function(name, file, line, char, e) {
    if (e.message === "SecurityError") {
      return;
    }
    return track("error", {
      message: e.message,
      type: "unhandled",
      stack: e.stack
    });
  };

}).call(this);

// from 'src/db.js'
// Generated by CoffeeScript 1.10.0
(function() {
  pb.db = {};

  pb.db.VERSION = 10;

  pb.json_parse = function(data) {
    var e, error;
    try {
      return JSON.parse(data);
    } catch (error) {
      e = error;
      return void 0;
    }
  };

  pb.db.version_guard = function() {
    var storage_version;
    if (localStorage.version) {
      storage_version = parseInt(localStorage.version);
      if (storage_version > pb.db.VERSION) {
        location.reload();
        return true;
      }
    }
  };

  pb.db.check = function() {
    var e, error;
    try {
      localStorage.setItem("test", "testing...");
      localStorage.removeItem("test");
      pb.db.local_storage = true;
    } catch (error) {
      e = error;
      pb.db.local_storage = false;
    }
    pb.db.version_guard();
    return localStorage.version = pb.db.VERSION;
  };

  pb.db.check();

  pb.db.get = function(key) {
    var ref, v;
    if (!pb.db.local_storage) {
      return;
    }
    v = localStorage.getItem(key);
    if (v && v !== void 0 && v !== "undefined") {
      v = pb.json_parse(v);
      if ((v != null ? v.version : void 0) !== pb.db.VERSION) {
        return;
      } else if (v.user_id !== ((ref = pb.account) != null ? ref.id : void 0)) {
        return;
      } else {
        return v.data;
      }
    }
  };

  pb.db.set = function(key, data) {
    var e, error, ref, value;
    if (!pb.db.local_storage || pb.db.version_guard()) {
      return;
    }
    value = {
      version: pb.db.VERSION,
      user_id: (ref = pb.account) != null ? ref.id : void 0,
      data: data
    };
    try {
      return localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      e = error;
      if (e.message.indexOf("QuotaExceededError") !== -1) {
        track("local_storage_error", {
          message: e.message,
          length: JSON.stringify(value).length
        });
        return goto("/auth_error?reason=localstorage");
      }
    }
  };

  pb.db.get_simple = function(key) {
    var v;
    if (!pb.db.local_storage) {
      return;
    }
    v = localStorage.getItem(key);
    if (v && v !== void 0 && v !== "undefined") {
      return pb.json_parse(v);
    }
  };

  pb.db.set_simple = function(key, value) {
    var e, error;
    if (!pb.db.local_storage || pb.db.version_guard()) {
      return;
    }
    try {
      return localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      e = error;
      if (e.message.indexOf("QuotaExceededError") !== -1) {
        track("local_storage_error", {
          message: e.message,
          length: JSON.stringify(value).length
        });
        return goto("/auth_error?reason=localstorage");
      }
    }
  };

  pb.db.del_simple = function(key) {
    if (!pb.db.local_storage) {
      return;
    }
    return localStorage.removeItem(key);
  };

  pb.db.clear = function() {
    if (!pb.db.local_storage) {
      return;
    }
    return localStorage.clear();
  };

  pb.db.space = function() {
    var k, total;
    total = 0;
    for (k in localStorage) {
      total += localStorage[k].length;
      console.log(k, (localStorage[k].length / 1024 / 1025).toFixed(1), "mb");
    }
    return console.log("total", (total / 1024 / 1025).toFixed(1), "mb");
  };

}).call(this);

// from 'src/extentions.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var new_tab;

  pb.URLS = {
    android: "https://play.google.com/store/apps/details?id=com.pushbullet.android&referrer=utm_source%3Dpushbullet.com",
    chrome: "https://chrome.google.com/webstore/detail/chlffgpmiacpedhhbkiomidkjlcfhogd",
    firefox: "https://addons.mozilla.org/en-US/firefox/addon/pushbullet/versions/",
    windows: "https://update.pushbullet.com/pushbullet_installer.exe",
    ios: "https://itunes.apple.com/us/app/pushbullet/id810352052?ls=1&mt=8",
    mac: "https://itunes.apple.com/us/app/pushbullet-from-pushbullet/id948415170?ls=1&mt=12",
    safari: "http://update.pushbullet.com/extension.safariextz",
    opera: "https://addons.opera.com/en/extensions/details/pushbullet/"
  };

  new_tab = function(url) {
    var ref;
    return (ref = open(url, '_blank')) != null ? ref.focus() : void 0;
  };

  pb.get_app = function() {
    return new_tab(pb.URLS.android);
  };

  pb.get_extension = function() {
    if (pb.browser.name === "Chrome") {
      new_tab(pb.URLS.chrome);
    }
    if (pb.browser.name === "Firefox") {
      new_tab(pb.URLS.firefox);
    }
    if (pb.browser.name === "Opera") {
      new_tab(pb.URLS.opera);
    }
    if (pb.browser.name === "Safari") {
      return new_tab(pb.URLS.safari);
    }
  };

  pb.set_extention_cookie = function() {
    var date, expires, name, value;
    name = "api_key";
    value = pb.account.api_key;
    date = new Date();
    date.setTime(date.getTime() + (365 * 24 * 60 * 60 * 1000));
    expires = "; expires=" + date.toGMTString();
    return document.cookie = name + "=" + value + expires + "; path=/; secure";
  };

  pb.set_desktop_cookie = function() {
    if (pb.account.api_key && (typeof localStorage !== "undefined" && localStorage !== null)) {
      return localStorage.desktop = "pushbullet access token is '" + pb.account.api_key + "'";
    }
  };

}).call(this);

// from 'src/api.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var AccountApiSuite, AccountsApiSuite, ApiSuite, AutocompleteApiSuite, BlocksApiSuite, ChannelsApiSuite, ChatsApiSuite, ClientsApiSuite, ContactsApiSuite, DeviceApiSuite, GrantsApiSuite, PingerSuite, PushesApiSuite, PushesHistory, RemoteFilesSuite, SmsApiSuite, SubscriptionsApiSuite, TextsApiSuite, become_account, clone, cmp, is_email, set_timeout, setup_events, try_parse,
    bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  pb.api = {};

  pb.api.bootstrapping = false;

  pb.api.bootstrap_error = false;

  pb.api.bootstrap = function() {
    var done, done_pushes, fetch_done, fetch_me, fetch_pushes, j, len, next_page, objects, results, target_done, type, types;
    if (pb.api.bootstrapping) {
      return;
    }
    pb.api.bootstrapping = true;
    types = ["accounts", "blocks", "channels", "chats", "clients", "contacts", "devices", "grants", "subscriptions", "texts"];
    objects = {};
    done = {};
    done_pushes = {};
    console.log("boot strapping");
    next_page = function(type, cursor) {
      var args;
      if (cursor == null) {
        cursor = null;
      }
      args = {
        limit: 500,
        active_only: true
      };
      if (cursor) {
        args.cursor = cursor;
      }
      return pb.net.get("/v2/" + type, args, function(r) {
        var j, len, obj, ref, ref1;
        if (r.error) {
          pb.api.bootstrap_error = "faild to fetch " + type;
        }
        if (r[type] == null) {
          pb.api.bootstrap_error = "faild to fetch " + type + ", not list";
        }
        if (((ref = r[type]) != null ? ref.length : void 0) > 0) {
          ref1 = r[type];
          for (j = 0, len = ref1.length; j < len; j++) {
            obj = ref1[j];
            objects[type].push(obj);
          }
        }
        if (r.cursor) {
          return next_page(type, r.cursor);
        } else {
          console.log("done syncable", type, objects[type].length);
          done[type] = true;
          return target_done(type);
        }
      });
    };
    target_done = function(type) {
      var all, finished, j, len, ref, target;
      for (type in done) {
        finished = done[type];
        if (finished === false) {
          return;
        }
      }
      for (type in objects) {
        all = objects[type];
        pb.api[type].set_all(all);
        pb.api[type].build_all();
        pb.api[type].loaded = true;
        pb.api[type].have_fetched = true;
        pb.api[type].save();
      }
      pb.sidebar.full_update();
      pb.api.pushes.objs = {};
      console.log("fetch pushes");
      ref = pb.targets.generate();
      for (j = 0, len = ref.length; j < len; j++) {
        target = ref[j];
        fetch_pushes(target);
      }
      fetch_me();
      return fetch_done();
    };
    fetch_pushes = function(target) {
      var args, key;
      console.log("fetch for", target.type, target.name);
      if (target.type === "chat") {
        key = target.obj["with"].email;
        args = {
          email: target.obj["with"].email
        };
      } else if (target.type === "subscription") {
        key = target.obj.channel.tag;
        args = {
          channel_tag: target.obj.channel.tag
        };
      } else if (target.type === "channel") {
        key = target.obj.tag;
        args = {
          channel_tag: target.obj.tag
        };
      } else if (target.type === "grant") {
        key = target.obj.client.iden;
        args = {
          client_iden: target.obj.client.iden
        };
      } else if (target.type === "device") {
        return;
      } else {
        return;
      }
      done_pushes[key] = false;
      args.limit = 40;
      args.active_only = true;
      return pb.net.get("/v2/pushes", args, function(r) {
        var j, len, push, ref, ref1;
        console.log("boot startped pushes", target.type, target.name, (ref = r.pushes) != null ? ref.length : void 0);
        if (r.pushes) {
          ref1 = r.pushes;
          for (j = 0, len = ref1.length; j < len; j++) {
            push = ref1[j];
            pb.api.pushes.objs[push.iden] = push;
          }
        }
        done_pushes[key] = true;
        return fetch_done();
      });
    };
    fetch_me = function() {
      var args, key;
      key = "me";
      args = {
        self: "true"
      };
      args.active_only = true;
      done_pushes[key] = false;
      return pb.net.get("/v2/pushes", args, function(r) {
        var j, len, push, ref;
        console.log("fetch pushes for me");
        if (r.pushes) {
          ref = r.pushes;
          for (j = 0, len = ref.length; j < len; j++) {
            push = ref[j];
            pb.api.pushes.objs[push.iden] = push;
          }
          pb.api.pushes.build_all();
        }
        done_pushes[key] = true;
        return fetch_done();
      });
    };
    fetch_done = function() {
      var finished, target;
      for (target in done_pushes) {
        finished = done_pushes[target];
        if (finished === false) {
          return;
        }
      }
      pb.api.pushes.build_all();
      pb.api.pushes.post_get();
      pb.api.pushes.save();
      return pb.everything.bootstrap(function() {
        console.log("all done");
        pb.sidebar.update();
        pb.setup.think();
        return pb.db.set("bootstrap", "done");
      });
    };
    results = [];
    for (j = 0, len = types.length; j < len; j++) {
      type = types[j];
      console.log("type", type);
      if (type === "texts") {
        continue;
      }
      objects[type] = [];
      done[type] = false;
      results.push(next_page(type));
    }
    return results;
  };

  pb.everything = {};

  pb.everything.modified_after = null;

  pb.everything.cursor = {};

  pb.everything.bootstrap = function(cb) {
    return pb.net.get("/v2/everything", {
      limit: 1
    }, function(r) {
      var array, type;
      for (type in r) {
        array = r[type];
        if (type !== "cursor" && array && array.length > 0) {
          pb.everything.modified_after = array[0].modified;
          pb.db.set("modified_after", pb.everything.modified_after);
          pb.db.set("notify_after", pb.everything.modified_after);
        }
      }
      pb.everything.start();
      return cb();
    });
  };

  pb.everything.start = function() {
    pb.everything.modified_after = pb.db.get("modified_after");
    return pb.api.pushes.notify_after = pb.db.get("notify_after");
  };

  pb.everything.tickle = function() {
    if (!pb.everything.modified_after) {
      return;
    }
    return pb.net.get("/v2/everything", {
      modified_after: pb.everything.modified_after
    }, function(r) {
      var array, j, len, obj, type;
      console.log("got tickle", r);
      for (type in r) {
        array = r[type];
        if (type === "profiles" && array && array[0]) {
          pb.api.account.set(array[0]);
        }
        if (!pb.api[type]) {
          continue;
        }
        if (array) {
          for (j = 0, len = array.length; j < len; j++) {
            obj = array[j];
            pb.api[type].objs[obj.iden] = obj;
            pb.api[type].new_item(obj);
            pb.everything.modified_after = Math.max(pb.everything.modified_after, obj.modified);
          }
          pb.api[type].build_all();
          pb.api[type].save();
        }
      }
      return pb.db.set("modified_after", pb.everything.modified_after);
    });
  };

  try_parse = function(x) {
    var error1;
    try {
      return JSON.parse(x.responseText);
    } catch (error1) {
      return {};
    }
  };

  cmp = function(a, b) {
    if (a < b) {
      return -1;
    }
    if (a > b) {
      return 1;
    }
    return 0;
  };

  is_email = function(email) {
    if (!email) {
      return false;
    }
    return email.indexOf("@") !== -1;
  };

  set_timeout = function(ms, fn) {
    return setTimeout(fn, ms);
  };

  clone = function(obj) {
    return JSON.parse(JSON.stringify(obj));
  };

  pb.api.suites = [];

  pb.session_id = pb.rand_iden();

  pb.net = {};

  pb.net.API_VERSION = "2014-05-07";

  pb.net.USER_AGENT = "Pushbullet Website " + pb.VERSION;

  pb.net.post = function(url, kargs, cb) {
    var ref, xhr;
    if (!((ref = pb.account) != null ? ref.api_key : void 0)) {
      return;
    }
    xhr = new XMLHttpRequest();
    xhr.open('POST', pb.API_SERVER + url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader("Authorization", "Basic " + btoa(pb.account.api_key + ":"));
    setup_events(xhr, cb);
    return xhr.send(JSON.stringify(kargs));
  };

  pb.net.get = function(url, kargs, cb) {
    var ref, xhr;
    if (!((ref = pb.account) != null ? ref.api_key : void 0)) {
      return;
    }
    xhr = new XMLHttpRequest();
    xhr.open('GET', pb.API_SERVER + onecup.mk_url(url, kargs));
    xhr.setRequestHeader("Authorization", "Basic " + btoa(pb.account.api_key + ":"));
    setup_events(xhr, cb);
    return xhr.send();
  };

  pb.net["delete"] = function(url, kargs, cb) {
    var ref, xhr;
    if (!((ref = pb.account) != null ? ref.api_key : void 0)) {
      return;
    }
    xhr = new XMLHttpRequest();
    xhr.open('DELETE', pb.API_SERVER + onecup.mk_url(url, kargs));
    xhr.setRequestHeader("Authorization", "Basic " + btoa(pb.account.api_key + ":"));
    setup_events(xhr, cb);
    return xhr.send();
  };

  pb.net.post_plain = function(url, kargs, cb) {
    var xhr;
    xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    setup_events(xhr, cb);
    return xhr.send(JSON.stringify(kargs));
  };

  pb.net.get_plain = function(url, kargs, cb) {
    var xhr;
    xhr = new XMLHttpRequest();
    xhr.open('GET', onecup.mk_url(url, kargs));
    setup_events(xhr, cb);
    return xhr.send();
  };

  pb.net.get_plain_text = function(url, kargs, cb) {
    var xhr;
    xhr = new XMLHttpRequest();
    xhr.open('GET', onecup.mk_url(url, kargs));
    xhr.onload = function() {
      onecup.refresh();
      if (xhr.status === 200) {
        return typeof cb === "function" ? cb(xhr.responseText) : void 0;
      } else {
        return typeof cb === "function" ? cb({
          error: {
            message: xhr.responseText
          }
        }) : void 0;
      }
    };
    xhr.onerror = function() {
      var error;
      error = {
        error: {
          message: "Could not connect to server"
        }
      };
      return typeof cb === "function" ? cb(error) : void 0;
    };
    return xhr.send();
  };

  setup_events = function(xhr, cb) {
    xhr.setRequestHeader("API-Version", pb.net.API_VERSION);
    xhr.setRequestHeader("X-User-Agent", pb.net.USER_AGENT);
    xhr.onload = function() {
      var data, error;
      onecup.refresh();
      if (xhr.status === 401) {
        if (pb.account != null) {
          track("error_auth", {
            message: xhr.responseText
          });
          pb.signout();
          if (xhr.responseText.indexOf("Access token is missing or invalid") !== -1) {
            goto("/auth_error?reason=token");
          } else {
            goto("/auth_error");
          }
        } else {
          error = {
            error: {
              message: "Unauthorized: Access is denied."
            }
          };
          if (typeof cb === "function") {
            cb(error);
          }
        }
      }
      if (xhr.status === 200) {
        data = JSON.parse(xhr.responseText);
        return typeof cb === "function" ? cb(data) : void 0;
      } else {
        error = JSON.parse(xhr.responseText);
        return typeof cb === "function" ? cb(error) : void 0;
      }
    };
    return xhr.onerror = function() {
      var error;
      pb.error.banner("Network Issue", "Could not connect to server");
      error = {
        error: {
          message: "Could not connect to server"
        }
      };
      return typeof cb === "function" ? cb(error) : void 0;
    };
  };

  ApiSuite = (function() {
    ApiSuite.prototype.uri = "";

    ApiSuite.prototype.name = "";

    ApiSuite.prototype.type = "";

    ApiSuite.prototype.nice_name = "";

    function ApiSuite() {
      this.clear_error = bind(this.clear_error, this);
      this.reset = bind(this.reset, this);
      this["delete"] = bind(this["delete"], this);
      this.update = bind(this.update, this);
      this.create = bind(this.create, this);
      pb.api.suites.push(this);
      this.all = [];
      this.objs = {};
      this.new_obj = {};
      this.loaded = false;
      this.getting = false;
      this.creating = false;
      this.updating = false;
      this.deleting = false;
      this.delete_check = false;
      this.have_fetched = false;
      this.modified_after = 0;
      this.clear_error();
    }

    ApiSuite.prototype.start = function() {
      this._load_storage();
      return this.have_fetched = true;
    };

    ApiSuite.prototype.post_get = function() {};

    ApiSuite.prototype.new_item = function(a) {};

    ApiSuite.prototype.build_all = function() {
      var iden, obj;
      this.all = (function() {
        var ref, results;
        ref = this.objs;
        results = [];
        for (iden in ref) {
          obj = ref[iden];
          if (obj.active) {
            results.push(obj);
          }
        }
        return results;
      }).call(this);
      return this.all.sort(function(a, b) {
        return b.created - a.created;
      });
    };

    ApiSuite.prototype.set_all = function(all) {
      var j, len, obj, ref, results;
      this.all = all;
      this.objs = {};
      ref = this.all;
      results = [];
      for (j = 0, len = ref.length; j < len; j++) {
        obj = ref[j];
        results.push(this.objs[obj.iden] = obj);
      }
      return results;
    };

    ApiSuite.prototype.create = function(obj) {
      this.creating = true;
      this.creating_obj = obj;
      return pb.net.post(this.uri, obj, (function(_this) {
        return function(r) {
          var ref;
          _this.creating = false;
          if (r.error) {
            return pb.error.banner("Error creating " + _this.nice_name, (ref = r.error) != null ? ref.message : void 0);
          } else {
            _this.all.push(r);
            _this.new_obj = {};
            _this.clear_error();
            console.log("Created " + _this.nice_name + ":", r);
            return _this.post_create(r);
          }
        };
      })(this));
    };

    ApiSuite.prototype.post_create = function() {};

    ApiSuite.prototype.update = function(obj) {
      this.updating = obj.iden;
      this.objs[obj.iden] = obj;
      this.build_all();
      return pb.net.post(this.uri + "/" + obj.iden, obj, (function(_this) {
        return function(r) {
          var ref;
          _this.updating = false;
          pb.sidebar.update();
          if (r.error) {
            return pb.error.banner("Error updating " + _this.nice_name, (ref = r.error) != null ? ref.message : void 0);
          } else {
            console.log("Updated " + _this.nice_name + ":", r);
            return _this.clear_error();
          }
        };
      })(this));
    };

    ApiSuite.prototype["delete"] = function(obj) {
      var o;
      o = this.objs[obj.iden];
      if (o != null) {
        o.active = false;
      }
      if (o != null) {
        o.modified = this.modified_after + .001;
      }
      this.build_all();
      this.deleting = obj.iden;
      return pb.net["delete"](this.uri + "/" + obj.iden, {}, (function(_this) {
        return function(r) {
          var ref;
          _this.deleting = false;
          _this.delete_check = false;
          pb.sidebar.update();
          if (r.error) {
            return pb.error.banner("Error deleting " + _this.nice_name, (ref = r.error) != null ? ref.message : void 0);
          } else {
            _this.clear_error();
            _this.save();
            return console.log("Deleted " + _this.nice_name + ":", r);
          }
        };
      })(this));
    };

    ApiSuite.prototype.reset = function(obj) {
      this.all = [];
      this.objs = {};
      return this.loaded = false;
    };

    ApiSuite.prototype.clear_error = function() {};

    ApiSuite.prototype.save = function() {
      this._save_storage();
      pb.sidebar.update();
      return refresh();
    };

    ApiSuite.prototype._save_storage = function() {
      var k, obj, ref, store;
      store = [];
      ref = this.objs;
      for (k in ref) {
        obj = ref[k];
        store.push(obj);
      }
      return pb.db.set(this.name, {
        objs: store,
        modified_after: this.modified_after
      });
    };

    ApiSuite.prototype._load_storage = function() {
      var data, j, len, obj, ref;
      data = pb.db.get(this.name);
      this.objs = {};
      if (data && data.objs) {
        ref = data.objs;
        for (j = 0, len = ref.length; j < len; j++) {
          obj = ref[j];
          this.objs[obj.iden] = obj;
        }
      }
      this.loaded = true;
      this.build_all();
      return this.post_get();
    };

    return ApiSuite;

  })();

  PushesHistory = (function() {
    function PushesHistory() {}

    PushesHistory.prototype.ontop = {};

    PushesHistory.prototype.cursors = {};

    PushesHistory.prototype.in_progress = {};

    PushesHistory.prototype.key_args = function(target) {
      var args, key;
      if (!target) {
        key = "me";
        args = {
          self: "true"
        };
      } else if (target.type === "chat") {
        key = target.obj["with"].email;
        args = {
          email: target.obj["with"].email
        };
      } else if (target.type === "device") {
        key = "me";
        args = {
          self: "true"
        };
      } else if (target.type === "subscription") {
        key = target.obj.channel.tag;
        args = {
          channel_tag: target.obj.channel.tag
        };
      } else if (target.type === "channel") {
        key = target.obj.tag;
        args = {
          channel_tag: target.obj.tag
        };
      } else if (target.type === "grant") {
        key = target.obj.client.iden;
        args = {
          channel_tag: target.obj.client.iden
        };
      }
      return [key, args];
    };

    PushesHistory.prototype.loading = function(target) {
      var args, key, ref;
      ref = this.key_args(pb.pushbox.target), key = ref[0], args = ref[1];
      return this.in_progress[key] || false;
    };

    PushesHistory.prototype.top = function(target) {
      var args, key, ref;
      ref = this.key_args(pb.pushbox.target), key = ref[0], args = ref[1];
      return this.ontop[key];
    };

    PushesHistory.prototype.load_more = function(target) {
      var args, key, ref;
      ref = this.key_args(target), key = ref[0], args = ref[1];
      if (!args) {
        return;
      }
      if (this.ontop[key]) {
        return;
      }
      if (this.cursors[key]) {
        args.limit = 500;
        args.cursor = this.cursors[key];
      } else {
        args.limit = 500;
      }
      this.in_progress[key] = true;
      return pb.net.get("/v2/pushes", args, (function(_this) {
        return function(r) {
          var a, j, len, ref1, ref2;
          _this.in_progress[key] = false;
          if (r.pushes) {
            ref1 = r.pushes;
            for (j = 0, len = ref1.length; j < len; j++) {
              a = ref1[j];
              if (((ref2 = pb.api.pushes.objs[a.iden]) != null ? ref2.modified : void 0) > a.modified) {
                continue;
              }
              pb.api.pushes.objs[a.iden] = a;
              pb.api.pushes.new_item(a);
            }
          }
          pb.api.pushes.build_all();
          pb.api.pushes.post_get();
          if (r.cursor) {
            return _this.cursors[key] = r.cursor;
          } else {
            _this.ontop[key] = true;
            return _this.cursors[key] = null;
          }
        };
      })(this));
    };

    return PushesHistory;

  })();

  PushesApiSuite = (function(superClass) {
    extend(PushesApiSuite, superClass);

    function PushesApiSuite() {
      this.do_push_queue = bind(this.do_push_queue, this);
      return PushesApiSuite.__super__.constructor.apply(this, arguments);
    }

    PushesApiSuite.prototype.uri = "/v2/pushes";

    PushesApiSuite.prototype.name = "pushes";

    PushesApiSuite.prototype.type = "push";

    PushesApiSuite.prototype.nice_name = "Push";

    PushesApiSuite.prototype.default_image_url = "/img/deviceicons/everything.png";

    PushesApiSuite.prototype.queue = [];

    PushesApiSuite.prototype.error_queue = [];

    PushesApiSuite.prototype.file_queue = [];

    PushesApiSuite.prototype.notify_after = false;

    PushesApiSuite.prototype.notified_push_idens = null;

    PushesApiSuite.prototype.start = function() {
      return this._load_storage();
    };

    PushesApiSuite.prototype._save_storage = function() {
      var j, l, len, len1, number, push, pushes, ref, ref1, target;
      pushes = [];
      ref = pb.targets.generate();
      for (j = 0, len = ref.length; j < len; j++) {
        target = ref[j];
        number = 0;
        ref1 = pb.api.pushes.all;
        for (l = 0, len1 = ref1.length; l < len1; l++) {
          push = ref1[l];
          if (pb.pushes.filter(target, push)) {
            pushes.push(push);
            number += 1;
          }
          if (number > 40) {
            break;
          }
        }
      }
      return pb.db.set(this.name, {
        objs: pushes,
        modified_after: this.modified_after
      });
    };

    PushesApiSuite.prototype.post_get = function() {
      this.notify_after = pb.db.get("notify_after");
      return this.notified_push_idens = pb.db.get("notified_push_idens") || [];
    };

    PushesApiSuite.prototype.new_item = function(push) {
      this.remove_from_queue(push);
      this.do_push_queue();
      return pb.api.remotefiles.new_push(push);
    };

    PushesApiSuite.prototype.notified = function(push) {
      if (push.iden != null) {
        this.notified_push_idens.push(push.iden);
        pb.db.set("notified_push_idens", this.notified_push_idens);
        return pb.sidebar.update();
      }
    };

    PushesApiSuite.prototype.dismissing = {};

    PushesApiSuite.prototype.dismiss = function(push) {
      if (!this.dismissing[push.iden]) {
        this.dismissing[push.iden] = true;
        push.dismissed = true;
        return pb.api.pushes.update(push);
      }
    };

    PushesApiSuite.prototype.should_notify = function(push) {
      if (this.notified_push_idens === null) {
        return;
      }
      if (this.notify_after === false || this.notify_after >= push.modified) {
        return false;
      }
      if (push.direction !== "incoming") {
        return false;
      }
      if (push.dismissed) {
        if ((push.awake_app_guids != null) && push.awake_app_guids.indexOf("web-" + pb.session_id) !== -1) {
          if (this.notified_push_idens.indexOf(push.iden) === -1) {
            return true;
          }
        }
        return false;
      }
      return true;
    };

    PushesApiSuite.prototype.send_file = function(file) {
      var push, reader;
      if (file == null) {
        return;
      }
      push = {};
      push.type = "file";
      this.add_target(push);
      push.file = file;
      push.file_name = file.name;
      push.progress = 0;
      if (file.type.indexOf("image") !== -1) {
        reader = new FileReader();
        reader.onload = function(e) {
          var image_url, img;
          image_url = e.target.result;
          img = new Image();
          img.onload = function() {
            push.image_url = image_url;
            push.image_width = img.width;
            return push.image_height = img.height;
          };
          return img.src = image_url;
        };
        reader.readAsDataURL(file);
      }
      this.file_queue.push(push);
      return this.do_file_queue();
    };

    PushesApiSuite.prototype.do_file_queue = function() {
      var push;
      push = this.file_queue[this.file_queue.length - 1];
      if (push && !push.uploading) {
        return this.upload_push(push);
      }
    };

    PushesApiSuite.prototype.upload_push = function(push) {
      var file;
      push.uploading = true;
      file = push.file;
      return pb.net.post("/v3/start-upload", {
        name: file.name,
        size: file.size,
        type: file.type
      }, (function(_this) {
        return function(r) {
          if (r.error != null) {
            push.error = r.error.message;
            _this.remove_from_file_queue(push);
            _this.error_queue.push(push);
            return;
          }
          return _this.upload_file_parts(r, push);
        };
      })(this));
    };

    PushesApiSuite.prototype.upload_file_parts = function(upload, push, i) {
      var file_data, url, xhr;
      if (i == null) {
        i = 0;
      }
      url = upload.piece_urls.shift();
      file_data = push.file.slice(i * upload.piece_size, (i + 1) * upload.piece_size);
      xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      push.xhr = xhr;
      xhr.upload.onprogress = (function(_this) {
        return function(e) {
          var uploaded;
          if (e.lengthComputable) {
            uploaded = i * upload.piece_size + e.loaded;
            push.progress = uploaded / push.file.size * 100;
            return onecup.refresh();
          }
        };
      })(this);
      xhr.onload = (function(_this) {
        return function() {
          onecup.refresh();
          if (xhr.status !== 200) {
            push.error = "Uplading chunk " + i + " failed.";
            _this.remove_from_file_queue(push);
            _this.error_queue.push(push);
            return;
          }
          if (upload.piece_urls.length === 0) {
            return _this.upload_file_finish(upload, push);
          } else {
            return _this.upload_file_parts(upload, push, i + 1);
          }
        };
      })(this);
      xhr.onerror = (function(_this) {
        return function(e) {
          onecup.refresh();
          push.error = "Uplading chunk " + i + " failed.";
          _this.remove_from_file_queue(push);
          return _this.error_queue.push(push);
        };
      })(this);
      return xhr.send(file_data);
    };

    PushesApiSuite.prototype.upload_abort = function(push) {
      push.xhr.abort();
      push.error = "File upload canceled";
      push.progress = false;
      this.remove_from_file_queue(push);
      return this.error_queue.push(push);
    };

    PushesApiSuite.prototype.upload_file_finish = function(upload, push) {
      return pb.net.post("/v3/finish-upload", {
        id: upload.id
      }, (function(_this) {
        return function(r) {
          if (r.error != null) {
            push.error = r.error.message;
            _this.remove_from_file_queue(push);
            _this.error_queue.push(push);
            return;
          }
          push.file_url = r.file_url;
          push.file_type = r.file_type;
          push.upload_done = true;
          push.progress = 100;
          _this.remove_from_file_queue(push);
          _this.queue_push(push);
          _this.do_file_queue();
          return track("upload_file", {
            type: push.file_type,
            size: push.file.size
          });
        };
      })(this));
    };

    PushesApiSuite.prototype.upload_file = function(file, cb) {
      var upload_done, upload_parts;
      upload_parts = function(upload, i) {
        var file_data, url, xhr;
        if (i == null) {
          i = 0;
        }
        url = upload.piece_urls.shift();
        file_data = file.slice(i * upload.piece_size, (i + 1) * upload.piece_size);
        xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        upload.xhr = xhr;
        xhr.onload = (function(_this) {
          return function() {
            if (xhr.status !== 200) {
              cb(null);
              return;
            }
            if (upload.piece_urls.length === 0) {
              return upload_done(upload);
            } else {
              return upload_parts(upload, i + 1);
            }
          };
        })(this);
        xhr.onerror = (function(_this) {
          return function(e) {
            return cb(null);
          };
        })(this);
        return xhr.send(file_data);
      };
      upload_done = function(upload) {
        return pb.net.post("/v3/finish-upload", {
          id: upload.id
        }, (function(_this) {
          return function(final) {
            return cb(final);
          };
        })(this));
      };
      return pb.net.post("/v3/start-upload", {
        name: file.name,
        size: file.size,
        type: file.type
      }, (function(_this) {
        return function(upload) {
          return upload_parts(upload);
        };
      })(this));
    };

    PushesApiSuite.prototype.send = function(push) {
      this.add_target(push);
      return this.queue_push(push);
    };

    PushesApiSuite.prototype.add_target = function(push) {
      var obj, type;
      if (!pb.pushform.target) {
        return;
      }
      type = pb.pushform.target.type;
      obj = pb.pushform.target.obj;
      if (type === "device") {
        push.device_iden = obj.iden;
      } else if (type === "contact") {
        push.email = obj.email;
      } else if (type === "chat") {
        push.email = obj["with"].email;
      } else if (type === "channel") {
        push.channel_tag = obj.tag;
      } else if (is_email(pb.pushform.email)) {
        push.email = pb.pushform.email;
      } else if (type === "email") {
        push.email = pb.pushform.target.email;
      } else {
        push.error = "No recipient.";
        return;
      }
      push.sender_iden = pb.account.iden;
      push.created = Date.now() / 1000;
      push.ghost = true;
      return push.guid = pb.rand_iden();
    };

    PushesApiSuite.prototype.queue_push = function(push) {
      this.queue.push(push);
      return set_timeout(0, this.do_push_queue);
    };

    PushesApiSuite.prototype.do_push_queue = function() {
      var data, f, j, len, push, valid_push_fields;
      if (this.pushing) {
        return;
      }
      valid_push_fields = ['guid', 'type', 'title', 'body', 'url', 'file_name', 'file_url', 'file_type', 'device_iden', 'email', 'channel_tag', 'client_iden', 'source_device_iden'];
      push = this.queue[0];
      if (push && !push.error && !push.sent) {
        if (push.channel_tag) {
          if (!pb.api.subscriptions.by_channel_tag(push.channel_tag)) {
            push.guid = "";
          }
        }
        push.sent = true;
        track("push", {
          type: push.type
        });
        this.pushing = true;
        data = {};
        for (j = 0, len = valid_push_fields.length; j < len; j++) {
          f = valid_push_fields[j];
          data[f] = push[f];
        }
        return pb.net.post("/v2/pushes", data, (function(_this) {
          return function(server_push) {
            if (server_push.error) {
              push.error = server_push.error.message;
              _this.remove_from_queue(push);
              _this.error_queue.push(push);
            } else {
              push.iden = server_push.iden;
            }
            if (!push.guid) {
              _this.remove_from_queue(push);
            }
            _this.pushing = false;
            _this.do_push_queue();
            if (push.type === "file") {
              pb.setup.done("files");
            }
            if (push.type === "link") {
              pb.setup.done("links");
            }
            if (push.email) {
              return pb.setup.done("chat");
            }
          };
        })(this));
      }
    };

    PushesApiSuite.prototype.remove_from_queue = function(push) {
      var p;
      return this.queue = (function() {
        var j, len, ref, results;
        ref = this.queue;
        results = [];
        for (j = 0, len = ref.length; j < len; j++) {
          p = ref[j];
          if (p.guid !== push.guid) {
            results.push(p);
          }
        }
        return results;
      }).call(this);
    };

    PushesApiSuite.prototype.remove_from_file_queue = function(push) {
      var p;
      return this.file_queue = (function() {
        var j, len, ref, results;
        ref = this.file_queue;
        results = [];
        for (j = 0, len = ref.length; j < len; j++) {
          p = ref[j];
          if (p.guid !== push.guid) {
            results.push(p);
          }
        }
        return results;
      }).call(this);
    };

    PushesApiSuite.prototype.remove_from_error_queue = function(push) {
      var p;
      return this.error_queue = (function() {
        var j, len, ref, results;
        ref = this.error_queue;
        results = [];
        for (j = 0, len = ref.length; j < len; j++) {
          p = ref[j];
          if (p.guid !== push.guid) {
            results.push(p);
          }
        }
        return results;
      }).call(this);
    };

    PushesApiSuite.prototype.retry_send = function(push) {
      this.remove_from_error_queue(push);
      push.error = false;
      push.sent = false;
      if (push.type === "file") {
        return this.upload_push(push);
      } else {
        return this.send(push);
      }
    };

    PushesApiSuite.prototype.delete_all = function() {
      track("delete_all_pushes", {
        number: this.all.length
      });
      this.deleting = true;
      return pb.net["delete"](this.uri, {}, (function(_this) {
        return function(r) {
          var ref;
          _this.reset();
          if (r.error) {
            return pb.error.banner("Error deleting all pushes", (ref = r.error) != null ? ref.message : void 0);
          } else {
            return _this.deleting = false;
          }
        };
      })(this));
    };

    return PushesApiSuite;

  })(ApiSuite);

  DeviceApiSuite = (function(superClass) {
    extend(DeviceApiSuite, superClass);

    function DeviceApiSuite() {
      return DeviceApiSuite.__super__.constructor.apply(this, arguments);
    }

    DeviceApiSuite.prototype.uri = "/v2/devices";

    DeviceApiSuite.prototype.name = "devices";

    DeviceApiSuite.prototype.type = "device";

    DeviceApiSuite.prototype.nice_name = "Device";

    DeviceApiSuite.prototype.default_image_url = "/img/deviceicons/phone.png";

    DeviceApiSuite.prototype.last_awake_time = 0;

    DeviceApiSuite.prototype.last_awake_state = false;

    DeviceApiSuite.prototype.is_awake = function() {
      if (this.last_awake_state === true) {
        if (this.last_awake_time > Date.now() - 60 * 1000) {
          return true;
        }
      }
      return false;
    };

    DeviceApiSuite.prototype.awake = function(state) {
      if (state == null) {
        state = true;
      }
      if (state) {
        pb.api.account.track_active();
      }
      if ((typeof location !== "undefined" && location !== null ? location.pathname : void 0) !== "/") {
        return;
      }
      if (this.last_awake_state === state) {
        if (this.last_awake_time > Date.now() - 60 * 1000) {
          return;
        }
      }
      this.last_awake_time = Date.now();
      this.last_awake_state = state;
      console.log("setting awake", state, "guid", pb.session_id);
      return pb.net.post("/v3/set-app-state", {
        awake: state,
        guid: "web-" + pb.session_id
      });
    };

    DeviceApiSuite.prototype.guess_icon = function(device) {
      var ref;
      if (device.icon != null) {
        return "/img/deviceicons/" + device.icon + ".png";
      }
      if ((ref = device.type) === "chrome" || ref === "firefox" || ref === "opera" || ref === "safari") {
        return "/img/deviceicons/browser.png";
      }
      if (device.type === "windows" || device.type === "mac") {
        return "/img/deviceicons/desktop.png";
      }
      return "/img/deviceicons/phone.png";
    };

    return DeviceApiSuite;

  })(ApiSuite);

  ContactsApiSuite = (function(superClass) {
    extend(ContactsApiSuite, superClass);

    function ContactsApiSuite() {
      return ContactsApiSuite.__super__.constructor.apply(this, arguments);
    }

    ContactsApiSuite.prototype.uri = "/v2/contacts";

    ContactsApiSuite.prototype.name = "contacts";

    ContactsApiSuite.prototype.type = "contact";

    ContactsApiSuite.prototype.nice_name = "Contact";

    ContactsApiSuite.prototype.default_image_url = "/img/deviceicons/user.png";

    ContactsApiSuite.prototype.build_all = function() {
      var iden, obj;
      this.all = (function() {
        var ref, results;
        ref = this.objs;
        results = [];
        for (iden in ref) {
          obj = ref[iden];
          if (obj.active) {
            results.push(obj);
          }
        }
        return results;
      }).call(this);
      return this.all.sort(function(a, b) {
        var aname, bname, ref, ref1;
        aname = ((ref = a.name) != null ? ref.toLowerCase() : void 0) || "";
        bname = ((ref1 = b.name) != null ? ref1.toLowerCase() : void 0) || "";
        return cmp(aname, bname);
      });
    };

    ContactsApiSuite.prototype.by_email = function(email) {
      var c, j, len, ref;
      ref = this.all;
      for (j = 0, len = ref.length; j < len; j++) {
        c = ref[j];
        if (c.email === email || c.email_normalized === email) {
          return c;
        }
      }
      return null;
    };

    return ContactsApiSuite;

  })(ApiSuite);

  ChatsApiSuite = (function(superClass) {
    extend(ChatsApiSuite, superClass);

    function ChatsApiSuite() {
      return ChatsApiSuite.__super__.constructor.apply(this, arguments);
    }

    ChatsApiSuite.prototype.uri = "/v2/chats";

    ChatsApiSuite.prototype.name = "chats";

    ChatsApiSuite.prototype.type = "chat";

    ChatsApiSuite.prototype.nice_name = "Chat";

    ChatsApiSuite.prototype.default_image_url = "/img/deviceicons/user.png";

    ChatsApiSuite.prototype.create = function(email) {
      return ChatsApiSuite.__super__.create.call(this, {
        email: email
      });
    };

    ChatsApiSuite.prototype.post_get = function() {
      return pb.pushbox.from_url();
    };

    ChatsApiSuite.prototype.post_create = function() {
      return pb.pushbox.from_url();
    };

    ChatsApiSuite.prototype.by_email = function(email) {
      var c, j, len, ref;
      ref = this.all;
      for (j = 0, len = ref.length; j < len; j++) {
        c = ref[j];
        if (c["with"].email === email || c["with"].email_normalized === email) {
          return c;
        }
      }
      return null;
    };

    ChatsApiSuite.prototype.invite = function(email) {
      track("invite", {
        email: email
      });
      return pb.net.post("/v3/send-invite", {
        email: email
      }, (function(_this) {
        return function(r) {};
      })(this));
    };

    return ChatsApiSuite;

  })(ApiSuite);

  ClientsApiSuite = (function(superClass) {
    extend(ClientsApiSuite, superClass);

    function ClientsApiSuite() {
      return ClientsApiSuite.__super__.constructor.apply(this, arguments);
    }

    ClientsApiSuite.prototype.uri = "/v2/clients";

    ClientsApiSuite.prototype.name = "clients";

    ClientsApiSuite.prototype.type = "client";

    ClientsApiSuite.prototype.nice_name = "OAuth Client";

    ClientsApiSuite.prototype.default_image_url = "/img/deviceicons/system.png";

    ClientsApiSuite.prototype.infos = {};

    ClientsApiSuite.prototype.info = function(client_id) {
      if (!this.infos[client_id]) {
        this.infos[client_id] = {
          client_id: client_id,
          state: "loading"
        };
        this.getting = "client_info";
        pb.net.get("/oauth2/client-info", {
          client_id: client_id
        }, (function(_this) {
          return function(r) {
            var ref;
            _this.clear_error();
            _this.infos[client_id] = r;
            if (r.error) {
              pb.error.banner("Error getting one client_info:" + _this.nice_name, (ref = r.error) != null ? ref.message : void 0);
              return _this.infos[client_id] = {
                client_id: client_id,
                state: "error"
              };
            } else {
              return _this.getting = false;
            }
          };
        })(this));
      }
      return this.infos[client_id];
    };

    return ClientsApiSuite;

  })(ApiSuite);

  GrantsApiSuite = (function(superClass) {
    extend(GrantsApiSuite, superClass);

    function GrantsApiSuite() {
      return GrantsApiSuite.__super__.constructor.apply(this, arguments);
    }

    GrantsApiSuite.prototype.uri = "/v2/grants";

    GrantsApiSuite.prototype.name = "grants";

    GrantsApiSuite.prototype.type = "grant";

    GrantsApiSuite.prototype.nice_name = "OAuth Grant";

    GrantsApiSuite.prototype.default_image_url = "/img/deviceicons/system.png";

    GrantsApiSuite.prototype.by_client_iden = function(client_iden) {
      var grant, j, len, ref;
      ref = this.all;
      for (j = 0, len = ref.length; j < len; j++) {
        grant = ref[j];
        if (grant.client.iden === client_iden) {
          return grant;
        }
      }
    };

    GrantsApiSuite.prototype.build_all = function() {
      var iden, obj;
      this.all = (function() {
        var ref, results;
        ref = this.objs;
        results = [];
        for (iden in ref) {
          obj = ref[iden];
          if (obj.active && obj.client) {
            results.push(obj);
          }
        }
        return results;
      }).call(this);
      return this.all.sort(function(a, b) {
        var aname, bname, ref, ref1;
        aname = ((ref = a.client.name) != null ? ref.toLowerCase() : void 0) || "";
        bname = ((ref1 = b.client.name) != null ? ref1.toLowerCase() : void 0) || "";
        return cmp(aname, bname);
      });
    };

    return GrantsApiSuite;

  })(ApiSuite);

  ChannelsApiSuite = (function(superClass) {
    extend(ChannelsApiSuite, superClass);

    function ChannelsApiSuite() {
      this.exists = bind(this.exists, this);
      this.info = bind(this.info, this);
      return ChannelsApiSuite.__super__.constructor.apply(this, arguments);
    }

    ChannelsApiSuite.prototype.uri = "/v2/channels";

    ChannelsApiSuite.prototype.name = "channels";

    ChannelsApiSuite.prototype.type = "channel";

    ChannelsApiSuite.prototype.nice_name = "Channel";

    ChannelsApiSuite.prototype.default_image_url = "/img/deviceicons/channel.png";

    ChannelsApiSuite.prototype.infos = {};

    ChannelsApiSuite.prototype.by_tag = function(tag) {
      var channel, j, len, ref;
      ref = this.all;
      for (j = 0, len = ref.length; j < len; j++) {
        channel = ref[j];
        if (channel.tag === tag) {
          return channel;
        }
      }
      return null;
    };

    ChannelsApiSuite.prototype.post_create = function(channel) {
      return onecup.goto("/my-channel?tag=" + channel.tag);
    };

    ChannelsApiSuite.prototype.info = function(tag) {
      if (!this.infos[tag]) {
        this.infos[tag] = {
          tag: tag,
          state: "loading"
        };
        pb.net.get_plain(pb.API_SERVER + "/v2/channel-info", {
          tag: tag
        }, (function(_this) {
          return function(r) {
            var ref;
            if (r.error) {
              pb.error.banner("Error getting one channel-info:" + _this.nice_name, (ref = r.error) != null ? ref.message : void 0);
              return _this.infos[tag] = {
                tag: tag,
                state: "error"
              };
            } else {
              r.tag = tag;
              return _this.infos[tag] = r;
            }
          };
        })(this));
      }
      return this.infos[tag];
    };

    ChannelsApiSuite.prototype.exists = function(tag) {
      var ref, ref1;
      if (!this.infos[tag]) {
        this.infos[tag] = {
          tag: tag,
          state: "loading"
        };
        pb.net.get_plain(pb.API_SERVER + "/v2/channel-info", {
          tag: tag
        }, (function(_this) {
          return function(r) {
            if (r.error) {
              return _this.infos[tag] = {
                tag: tag,
                state: "error"
              };
            } else {
              r.tag = tag;
              return _this.infos[tag] = r;
            }
          };
        })(this));
      }
      return (ref = (ref1 = this.infos[tag]) != null ? ref1.state : void 0) !== "loading" && ref !== "error";
    };

    return ChannelsApiSuite;

  })(ApiSuite);

  SubscriptionsApiSuite = (function(superClass) {
    extend(SubscriptionsApiSuite, superClass);

    function SubscriptionsApiSuite() {
      this.is_subscribed = bind(this.is_subscribed, this);
      this.unsubscribe = bind(this.unsubscribe, this);
      this.subscribe = bind(this.subscribe, this);
      return SubscriptionsApiSuite.__super__.constructor.apply(this, arguments);
    }

    SubscriptionsApiSuite.prototype.uri = "/v2/subscriptions";

    SubscriptionsApiSuite.prototype.name = "subscriptions";

    SubscriptionsApiSuite.prototype.type = "subscription";

    SubscriptionsApiSuite.prototype.default_image_url = "/img/deviceicons/channel.png";

    SubscriptionsApiSuite.prototype.nice_name = "Subscription";

    SubscriptionsApiSuite.prototype.by_channel_iden = function(channel_iden) {
      var j, len, ref, subscription;
      ref = this.all;
      for (j = 0, len = ref.length; j < len; j++) {
        subscription = ref[j];
        if (subscription.channel.iden === channel_iden) {
          return subscription;
        }
      }
    };

    SubscriptionsApiSuite.prototype.by_channel_tag = function(channel_tag) {
      var j, len, ref, subscription;
      ref = this.all;
      for (j = 0, len = ref.length; j < len; j++) {
        subscription = ref[j];
        if (subscription.channel.tag === channel_tag) {
          return subscription;
        }
      }
    };

    SubscriptionsApiSuite.prototype.subscribe = function(channel) {
      this.subscribing_tag = channel.tag;
      return this.create({
        channel_tag: channel.tag
      });
    };

    SubscriptionsApiSuite.prototype.unsubscribe = function(channel) {
      var subscription;
      subscription = this.is_subscribed(channel);
      if (subscription) {
        return this["delete"](subscription);
      }
    };

    SubscriptionsApiSuite.prototype.is_subscribed = function(channel) {
      var j, len, ref, ref1, subscription;
      ref = this.all;
      for (j = 0, len = ref.length; j < len; j++) {
        subscription = ref[j];
        if (((ref1 = subscription.channel) != null ? ref1.tag : void 0) === (channel != null ? channel.tag : void 0)) {
          return subscription;
        }
      }
    };

    SubscriptionsApiSuite.prototype.build_all = function() {
      var iden, obj;
      this.all = (function() {
        var ref, results;
        ref = this.objs;
        results = [];
        for (iden in ref) {
          obj = ref[iden];
          if (obj.active) {
            results.push(obj);
          }
        }
        return results;
      }).call(this);
      return this.all.sort(function(a, b) {
        var aname, bname, ref, ref1;
        aname = ((ref = a.channel.name) != null ? ref.toLowerCase() : void 0) || "";
        bname = ((ref1 = b.channel.name) != null ? ref1.toLowerCase() : void 0) || "";
        return cmp(aname, bname);
      });
    };

    return SubscriptionsApiSuite;

  })(ApiSuite);

  BlocksApiSuite = (function(superClass) {
    extend(BlocksApiSuite, superClass);

    function BlocksApiSuite() {
      return BlocksApiSuite.__super__.constructor.apply(this, arguments);
    }

    BlocksApiSuite.prototype.uri = "/v2/blocks";

    BlocksApiSuite.prototype.name = "blocks";

    BlocksApiSuite.prototype.type = "block";

    BlocksApiSuite.prototype.nice_name = "Block";

    BlocksApiSuite.prototype.default_image_url = "/img/deviceicons/user.png";

    BlocksApiSuite.prototype.block = function(email) {
      return this.create({
        email: email
      });
    };

    BlocksApiSuite.prototype.unblock = function(email) {
      var block;
      block = this.by_email(email);
      if (block) {
        return this["delete"](block);
      }
    };

    BlocksApiSuite.prototype.build_all = function() {
      var iden, obj;
      this.all = (function() {
        var ref, results;
        ref = this.objs;
        results = [];
        for (iden in ref) {
          obj = ref[iden];
          if (obj.active) {
            results.push(obj);
          }
        }
        return results;
      }).call(this);
      return this.all.sort(function(a, b) {
        var aname, bname, ref, ref1;
        aname = ((ref = a.user.name) != null ? ref.toLowerCase() : void 0) || "";
        bname = ((ref1 = b.user.name) != null ? ref1.toLowerCase() : void 0) || "";
        return cmp(aname, bname);
      });
    };

    BlocksApiSuite.prototype.by_email = function(email) {
      var c, j, len, ref, ref1, ref2;
      ref = this.all;
      for (j = 0, len = ref.length; j < len; j++) {
        c = ref[j];
        if (((ref1 = c.user) != null ? ref1.email : void 0) === email || ((ref2 = c.user) != null ? ref2.email_normalized : void 0) === email) {
          return c;
        }
      }
      return null;
    };

    return BlocksApiSuite;

  })(ApiSuite);

  AccountsApiSuite = (function(superClass) {
    extend(AccountsApiSuite, superClass);

    function AccountsApiSuite() {
      return AccountsApiSuite.__super__.constructor.apply(this, arguments);
    }

    AccountsApiSuite.prototype.uri = "/v2/accounts";

    AccountsApiSuite.prototype.name = "accounts";

    AccountsApiSuite.prototype.type = "account";

    AccountsApiSuite.prototype.default_image_url = "/img/deviceicons/user.png";

    AccountsApiSuite.prototype.nice_name = "Account";

    return AccountsApiSuite;

  })(ApiSuite);

  AccountApiSuite = (function() {
    function AccountApiSuite() {}

    AccountApiSuite.prototype.last_active = 0;

    AccountApiSuite.prototype.preferences = {};

    AccountApiSuite.prototype.track_active = function() {
      if (this.last_active + 60 * 60 * 1000 < Date.now()) {
        this.last_active = Date.now();
        return track("active");
      }
    };

    AccountApiSuite.prototype.start = function() {
      this.load_preferences();
      this.get();
      return this.track_active();
    };

    AccountApiSuite.prototype.get = function() {
      return pb.net.get("/v2/users/me", {}, (function(_this) {
        return function(data) {
          if (!pb.account) {
            return;
          }
          data.api_key = pb.account.api_key;
          pb.account = data;
          return pb.db.set_simple("account", pb.account);
        };
      })(this));
    };

    AccountApiSuite.prototype.save = function() {
      pb.db.set_simple("account", pb.account);
      return this.save_preferences();
    };

    AccountApiSuite.prototype.set = function(account) {
      account.api_key = pb.account.api_key;
      pb.account = account;
      if (pb.account.pro && pb.pro.upgrading === "upgrading") {
        pb.pro.upgrading = "done";
      }
      return onecup.refresh();
    };

    AccountApiSuite.prototype["delete"] = function() {
      return pb.net["delete"]("/v2/users/me", {}, (function(_this) {
        return function(r) {
          return pb.signout();
        };
      })(this));
    };

    AccountApiSuite.prototype.delete_all_access_tokens = function() {
      return pb.net.post("/v3/delete-all-access-tokens", {}, (function(_this) {
        return function(r) {
          return pb.signout();
        };
      })(this));
    };

    AccountApiSuite.prototype.create_access_token = function() {
      return pb.net.post("/v3/create-access-token", {}, (function(_this) {
        return function(r) {
          console.log("create_access_token:", r);
          return _this.generated_access_token = r.access_token;
        };
      })(this));
    };

    AccountApiSuite.prototype.setup_done = function(type) {
      this.preferences["setup_" + type] = true;
      return this.save();
    };

    AccountApiSuite.prototype.setup_restart = function(type) {
      return delete this.preferences["setup_" + type];
    };

    AccountApiSuite.prototype.load_preferences = function() {
      this.preferences = pb.db.get('preferences') || {};
      return pb.net.post('/v3/get-permanent', {
        key: "web_preferences"
      }, (function(_this) {
        return function(r) {
          if (!r.error) {
            _this.preferences = r.data || {};
          }
          return pb.setup.think();
        };
      })(this));
    };

    AccountApiSuite.prototype.migrate_preferences = function() {
      pb.net.post('/v3/set-permanent', {
        key: 'web_preferences',
        data: pb.account.preferences
      });
      return pb.db.set('preferences', this.preferences);
    };

    AccountApiSuite.prototype.save_preferences = function() {
      pb.db.set('preferences', this.preferences);
      return pb.net.post('/v3/set-permanent', {
        key: 'web_preferences',
        data: this.preferences
      });
    };

    AccountApiSuite.prototype.upgrade_pro = function(token_id, plan_id) {
      return pb.net.post('/v3/upgrade-pro', {
        token_id: token_id,
        plan_id: plan_id
      });
    };

    AccountApiSuite.prototype.downgrade_pro = function() {
      return pb.net.post('/v3/downgrade-pro', {}, function(r) {
        if (r.error) {
          track("pro_downgrade_error");
          return pb.pro.downgrade_status = "error";
        } else {
          track("pro_downgrade");
          return pb.pro.downgrade_status = "success";
        }
      });
    };

    return AccountApiSuite;

  })();

  AutocompleteApiSuite = (function() {
    function AutocompleteApiSuite() {}

    AutocompleteApiSuite.prototype.cache = {};

    AutocompleteApiSuite.prototype.suggested = null;

    AutocompleteApiSuite.prototype.invite_targets_cache = null;

    AutocompleteApiSuite.prototype.suggest_targets = function() {
      if (this.suggested === null) {
        this.suggested = [];
        pb.net.post("/v3/suggest-targets", {}, (function(_this) {
          return function(r) {
            if (r.targets) {
              return _this.suggested = r.targets;
            }
          };
        })(this));
      }
      return this.suggested;
    };

    AutocompleteApiSuite.prototype.invite_targets = function() {
      if (this.invite_targets_cache === null) {
        this.invite_targets_loading = true;
        this.invite_targets_cache = [];
        pb.net.post("/v3/invite-targets", {}, (function(_this) {
          return function(r) {
            if (r.targets) {
              _this.invite_targets_cache = r.targets;
            }
            return _this.invite_targets_loading = false;
          };
        })(this));
      }
      return this.invite_targets_cache;
    };

    AutocompleteApiSuite.prototype.targets = function(query) {
      var list;
      if (query === "") {
        return [];
      }
      list = this.cache[query];
      if (list != null) {
        return list;
      }
      this.cache[query] = [];
      pb.net.post("/v3/autocomplete-targets", {
        query: query
      }, (function(_this) {
        return function(r) {
          var ac, j, len, ref, targets;
          if (r.targets != null) {
            targets = [];
            ref = r.targets;
            for (j = 0, len = ref.length; j < len; j++) {
              ac = ref[j];
              targets.push(pb.targets.make_ac_target(ac));
            }
            return _this.cache[query] = targets;
          }
        };
      })(this));
      return this.cache[query];
    };

    AutocompleteApiSuite.prototype.import_targets = function(type, access_token) {
      return pb.net.post("/v3/import-targets", {
        type: type,
        access_token: access_token
      }, (function(_this) {
        return function(r) {
          return console.log("got r", r);
        };
      })(this));
    };

    return AutocompleteApiSuite;

  })();

  SmsApiSuite = (function() {
    SmsApiSuite.prototype.default_image_url = "/img/deviceicons/user.png";

    SmsApiSuite.prototype.default_group_image_url = "/img/deviceicons/group.png";

    function SmsApiSuite() {
      this.threads = [];
      this.thread = [];
    }

    SmsApiSuite.prototype.start = function() {};

    SmsApiSuite.prototype.tickle = function() {
      return this.fetch_device();
    };

    SmsApiSuite.prototype.first_sms_device = function() {
      var device, j, len, ref;
      ref = pb.api.devices.all;
      for (j = 0, len = ref.length; j < len; j++) {
        device = ref[j];
        if (device.has_sms) {
          return device;
        }
      }
      return null;
    };

    SmsApiSuite.prototype.first_thread = function() {
      if (this.threads.length > 0) {
        return this.threads[0];
      }
      return null;
    };

    SmsApiSuite.prototype.fetch_device = function() {
      var iden;
      if (!pb.sms.target) {
        return;
      }
      iden = pb.sms.target.obj.iden;
      return pb.net.get('/v2/permanents/' + iden + '_threads', {}, (function(_this) {
        return function(res) {
          var error1, j, len, ref, t, thread;
          if (res.encrypted) {
            try {
              res = JSON.parse(pb.e2e.decrypt(res.ciphertext));
              _this.threads = res.threads || [];
            } catch (error1) {
              _this.threads = [];
            }
          } else {
            _this.threads = res.threads || [];
          }
          thread = _this.threads[0];
          if (_this.current_thread) {
            thread = _this.current_thread;
          } else if (pb.sms.wants_thread_id) {
            ref = _this.threads;
            for (j = 0, len = ref.length; j < len; j++) {
              t = ref[j];
              if (t.id === pb.sms.wants_thread_id) {
                thread = _this.current_thread = t;
              }
            }
          }
          if (thread) {
            return _this.fetch_thread(thread.id);
          }
        };
      })(this));
    };

    SmsApiSuite.prototype.fetch_thread = function(thread_id) {
      var iden, j, len, ref, ref1, thread;
      if (!pb.sms.target) {
        return;
      }
      if (thread_id == null) {
        return;
      }
      if (((ref = this.current_thread) != null ? ref.id : void 0) !== thread_id) {
        this.thread = null;
        ref1 = this.threads;
        for (j = 0, len = ref1.length; j < len; j++) {
          thread = ref1[j];
          if (thread.id === thread_id) {
            this.current_thread = thread;
            break;
          }
        }
      }
      iden = pb.sms.target.obj.iden;
      return pb.net.get('/v2/permanents/' + iden + '_thread_' + thread_id, {}, (function(_this) {
        return function(res) {
          if (res.encrypted) {
            res = JSON.parse(pb.e2e.decrypt(res.ciphertext));
          }
          return _this.thread = res.thread;
        };
      })(this));
    };

    SmsApiSuite.prototype.phonebook_cache = {};

    SmsApiSuite.prototype.get_phonebook = function(device) {
      var phonebook;
      phonebook = this.phonebook_cache[device.iden];
      if (phonebook == null) {
        this.phonebook_cache[device.iden] = phonebook = {};
        phonebook.loading = true;
        pb.net.get("/v2/permanents/phonebook_" + device.iden, {}, (function(_this) {
          return function(r) {
            phonebook.loading = false;
            if (pb.e2e.enabled && r.encrypted) {
              r = JSON.parse(pb.e2e.decrypt(r.ciphertext));
            }
            if (r.phonebook != null) {
              phonebook.contacts = r.phonebook;
            } else {
              phonebook.error = "No Phone book returned.";
            }
            return _this.phonebook_cache[device.iden] = phonebook;
          };
        })(this));
      }
      return phonebook;
    };

    SmsApiSuite.prototype.set_limit = function(n) {
      return pb.net.post('/v3/admin-set-reply-count', {
        email: pb.account.email,
        reply_count: n
      }, function(r) {
        return pb.net.post('/v3/admin-update-reply-count-quota', {
          email: pb.account.email
        });
      });
    };

    return SmsApiSuite;

  })();

  TextsApiSuite = (function(superClass) {
    extend(TextsApiSuite, superClass);

    function TextsApiSuite() {
      return TextsApiSuite.__super__.constructor.apply(this, arguments);
    }

    TextsApiSuite.prototype.name = "texts";

    TextsApiSuite.prototype.type = "text";

    TextsApiSuite.prototype.nice_name = "Text";

    TextsApiSuite.prototype.send = function(device, addresses, message, guid, thread_id, file_type, file_url) {
      var text;
      track("sms_send", {
        thread: thread_id != null,
        address_count: addresses.length,
        image: file_url != null
      });
      text = {
        data: {
          target_device_iden: device.iden,
          addresses: addresses,
          guid: guid,
          message: message,
          file_type: file_type
        },
        file_url: file_url
      };
      if (pb.e2e.enabled) {
        text.data = {
          target_device_iden: text.data.target_device_iden,
          encrypted: true,
          ciphertext: pb.e2e.encrypt(JSON.stringify(text.data))
        };
      }
      return pb.net.post("/v3/create-text", text, (function(_this) {
        return function(r) {
          return console.log("/v3/create-text", r);
        };
      })(this));
    };

    TextsApiSuite.prototype["delete"] = function(text) {
      return pb.net.post("/v3/delete-text", {
        iden: text.iden
      }, (function(_this) {
        return function(r) {
          return console.log("/v3/delete-text", r);
        };
      })(this));
    };

    return TextsApiSuite;

  })(ApiSuite);

  PingerSuite = (function() {
    function PingerSuite() {
      this.online = {};
      this.last_ping_time = 0;
    }

    PingerSuite.prototype.pong_iden = function(device_iden) {
      this.online[device_iden] = Date.now();
      return refresh();
    };

    PingerSuite.prototype.ping_all = function() {
      var ping;
      if (this.last_ping_time + 60000 < Date.now()) {
        this.last_ping_time = Date.now();
        ping = {
          type: 'push',
          push: {
            type: 'ping'
          }
        };
        pb.net.post('/v2/ephemerals', ping, function(r) {
          return console.log("sent ping", r);
        });
        return onecup.later(6000, function() {
          return refresh();
        });
      }
    };

    return PingerSuite;

  })();

  RemoteFilesSuite = (function() {
    function RemoteFilesSuite() {}

    RemoteFilesSuite.prototype.contents = [];

    RemoteFilesSuite.prototype.path = "Loading...";

    RemoteFilesSuite.prototype.loading = true;

    RemoteFilesSuite.prototype.device = null;

    RemoteFilesSuite.prototype.directories = {};

    RemoteFilesSuite.prototype.thumbnails = {};

    RemoteFilesSuite.prototype.loading_thumb = false;

    RemoteFilesSuite.prototype.file_q = [];

    RemoteFilesSuite.prototype.send = function(push) {
      if (pb.e2e.enabled) {
        push = {
          encrypted: true,
          ciphertext: pb.e2e.encrypt(JSON.stringify(push))
        };
      }
      return pb.net.post('/v2/ephemerals', {
        type: "push",
        push: push
      });
    };

    RemoteFilesSuite.prototype.directory_request = function(path) {
      var key;
      this.loading = true;
      this.path = path;
      this.parent_path = null;
      key = this.device.iden + ":" + path;
      if (this.directories[key] != null) {
        this.directory(this.directories[key]);
        return;
      }
      return this.send({
        type: "remote_directory_request",
        source_user_iden: pb.account.iden,
        target_device_iden: this.device.iden,
        path: path
      });
    };

    RemoteFilesSuite.prototype.directory = function(push) {
      var key;
      if (!this.device) {
        return;
      }
      key = this.device.iden + ":" + push.path;
      this.directories[key] = push;
      if (this.path === push.path) {
        this.loading = false;
        this.parent_path = push.parent_path;
        return this.contents = push.contents;
      }
    };

    RemoteFilesSuite.prototype.load_thumbnail = function(path) {
      var key, thumb_state;
      key = this.device.iden + ":" + path;
      thumb_state = this.thumbnails[key];
      if (thumb_state != null) {
        if (thumb_state === "waiting") {
          if (!this.loading_thumb) {
            this.thumbnails[key] = "loading";
            this.thumbnail_request(path);
          }
          return false;
        } else if (thumb_state === "loading") {
          return false;
        } else {
          return this.thumbnails[key];
        }
      } else {
        if (this.loading_thumb) {
          this.thumbnails[key] = "waiting";
          return false;
        } else {
          this.thumbnails[key] = "loading";
          this.thumbnail_request(path);
          return false;
        }
      }
    };

    RemoteFilesSuite.prototype.thumbnail_request = function(path) {
      this.loading_thumb = true;
      return this.send({
        type: "remote_thumbnail_request",
        source_user_iden: pb.account.iden,
        target_device_iden: this.device.iden,
        path: path
      });
    };

    RemoteFilesSuite.prototype.thumbnail = function(push) {
      var key;
      if (!this.device) {
        return;
      }
      key = this.device.iden + ":" + push.path;
      this.thumbnails[key] = "data:image/jpeg;base64," + push.thumbnail;
      return this.loading_thumb = false;
    };

    RemoteFilesSuite.prototype.file_request = function(item) {
      var guid;
      track("remotefiles_request", {
        type: item.mime_type
      });
      guid = pb.rand_iden();
      this.file_q.push({
        item: item,
        guid: guid,
        done: false,
        confirmed: false
      });
      return this.send({
        guid: guid,
        type: "remote_file_request",
        source_user_iden: pb.account.iden,
        target_device_iden: this.device.iden,
        path: item.path
      });
    };

    RemoteFilesSuite.prototype.file_request_confirmed = function(push) {
      var file, j, len, ref, results;
      ref = this.file_q;
      results = [];
      for (j = 0, len = ref.length; j < len; j++) {
        file = ref[j];
        if (file.item.path === push.path) {
          file.confirmed = true;
          results.push(track("remotefiles_confirmed"));
        } else {
          results.push(void 0);
        }
      }
      return results;
    };

    RemoteFilesSuite.prototype.new_push = function(push) {
      var file, j, len, ref, results;
      ref = this.file_q;
      results = [];
      for (j = 0, len = ref.length; j < len; j++) {
        file = ref[j];
        if (file.guid === push.guid) {
          file.done = true;
          file.push = push;
          results.push(track("remotefiles_received"));
        } else {
          results.push(void 0);
        }
      }
      return results;
    };

    return RemoteFilesSuite;

  })();

  pb.api.account = new AccountApiSuite();

  pb.api.devices = new DeviceApiSuite();

  pb.api.contacts = new ContactsApiSuite();

  pb.api.chats = new ChatsApiSuite();

  pb.api.clients = new ClientsApiSuite();

  pb.api.grants = new GrantsApiSuite();

  pb.api.channels = new ChannelsApiSuite();

  pb.api.subscriptions = new SubscriptionsApiSuite();

  pb.api.blocks = new BlocksApiSuite();

  pb.api.pushes = new PushesApiSuite();

  pb.api.history = new PushesHistory();

  pb.api.accounts = new AccountsApiSuite();

  pb.api.autocomplete = new AutocompleteApiSuite();

  pb.api.sms = new SmsApiSuite();

  pb.api.texts = new TextsApiSuite();

  pb.api.pinger = new PingerSuite();

  pb.api.remotefiles = new RemoteFilesSuite();

  pb.api.start = function() {
    if (!pb.account) {
      return;
    }
    if (pb.db.get("bootstrap") !== "done") {
      pb.api.bootstrap();
    } else {
      pb.everything.start();
      pb.api.devices.start();
      pb.api.contacts.start();
      pb.api.chats.start();
      pb.api.pushes.start();
      pb.api.clients.start();
      pb.api.grants.start();
      pb.api.channels.start();
      pb.api.subscriptions.start();
      pb.api.blocks.start();
      pb.api.accounts.start();
      pb.api.texts.start();
      pb.sidebar.update();
    }
    pb.api.account.start();
    pb.e2e.init();
    return pb.setup.think();
  };

  pb.api.fetch_all = function() {
    pb.everything.tickle();
    return pb.api.sms.start();
  };

  pb.api.resize_img = function(url, s) {
    if (!url) {
      return "/img/deviceicons/user.png";
    }

    /*
    Some objects have an image_url property that can be resized for faster downloading on the client.
    Here's a list of common domains and how to resize the image to be a 200 pixel square:
    
    googleusercontent.com: add ?sz=<pixels> to the end of the url
    before: https://lh6.googleusercontent.com/-7JAEAYp78gw/AAAAAAAAAAI/AAAAAAAAAVw/zNWuySUUHs4/photo.jpg
    after: https://lh6.googleusercontent.com/-7JAEAYp78gw/AAAAAAAAAAI/AAAAAAAAAVw/zNWuySUUHs4/photo.jpg?sz=200
    
    graph.facebook.com: add ?width=<pixels>&height=<pixels> to the end of the url
    before: https://graph.facebook.com/10100201787233716/picture
    after: https://graph.facebook.com/10100201787233716/picture?width=200&height=200
    
    pushbullet.imgix.net: add ?w=<pixels>&h=<pixels>&fit=crop to the end of the url
    before: https://pushbullet.imgix.net/udprO-lv849tDMnhVDYC1gmOA7I3AmUefBP6yr/IMG_2375.JPG
    after: https://pushbullet.imgix.net/udprO-lv849tDMnhVDYC1gmOA7I3AmUefBP6yr/IMG_2375.JPG?w=200&h=200&...
     */
    if (url.indexOf("googleusercontent.com") !== -1) {
      return url + ("?sz=" + s);
    }
    if (url.indexOf("graph.facebook.com") !== -1) {
      return url + ("?width=" + s + "&height=" + s);
    }
    if (url.indexOf("pushbullet.imgix.net") !== -1) {
      return url + ("?w=" + s + "&h=" + s + "&fit=crop");
    }
    return url;
  };

  pb.api.error_report = function(reply_to, subject, body, data) {
    var report;
    report = {
      reply_to: reply_to,
      subject: subject,
      body: body,
      data: data
    };
    return pb.net.post("/v2/error-report", report, (function(_this) {
      return function(r) {
        return console.log("report submitted");
      };
    })(this));
  };

  pb.api.iden_to_type_object = function(iden) {
    var j, l, len, len1, obj, ref, ref1, suite;
    ref = pb.api.suites;
    for (j = 0, len = ref.length; j < len; j++) {
      suite = ref[j];
      ref1 = suite.all;
      for (l = 0, len1 = ref1.length; l < len1; l++) {
        obj = ref1[l];
        if (obj.iden === iden) {
          return [suite.type, obj];
        }
      }
    }
    return [null, null];
  };

  pb.ws = {};

  pb.ws.last_message = 0;

  pb.ws.connected = false;

  pb.api.listen_for_pushes = function() {
    var reconnect_timeout, url;
    if (typeof WebSocket === "undefined" || WebSocket === null) {
      return;
    }
    if (!pb.account) {
      return;
    }
    if (Date.now() - pb.ws.last_message < 50000) {
      return;
    }
    if (pb.ws.socket != null) {
      pb.ws.socket.close();
    }
    pb.ws.connected = false;
    url = "wss://websocket.pushbullet.com/subscribe/" + pb.account.api_key;
    pb.ws.socket = new WebSocket(url);
    reconnect_timeout = set_timeout(60000, function() {
      return pb.api.listen_for_pushes();
    });
    pb.ws.socket.onmessage = function(e) {
      var error1, error2, message, push;
      if (pb.ws.connected === false) {
        track("websocket_connected");
        pb.ws.connected = true;
        pb.api.fetch_all();
      }
      if (e.data !== '{"type": "nop"}') {
        console.log("message", e.data, (Date.now() - pb.ws.last_message) / 1000, "s");
      }
      pb.ws.last_message = Date.now();
      clearTimeout(reconnect_timeout);
      reconnect_timeout = set_timeout(60000, function() {
        return pb.api.listen_for_pushes();
      });
      try {
        message = JSON.parse(e.data);
      } catch (error1) {
        console.log("failed to parse WebSocket", e.data);
        return;
      }
      if (message.type === "tickle") {
        pb.everything.tickle();
        onecup.refresh();
      }
      if (message.type === "push") {
        push = message.push;
        if (push.encrypted) {
          try {
            push = JSON.parse(pb.e2e.decrypt(push.ciphertext));
          } catch (error2) {
            console.log("failed to parse WebSocket ciphertext", push.ciphertext);
            onecup.refresh();
            return;
          }
        }
        if (push.type === "sms_changed") {
          pb.api.sms.tickle();
          onecup.refresh();
        }
        if (push.type === "pong") {
          pb.api.pinger.pong_iden(push.device_iden);
        }
        if (push.type === "mirror") {
          pb.setup.done("notifications");
        }
        if (push.type === "remote_directory") {
          pb.api.remotefiles.directory(push);
          onecup.refresh();
        }
        if (push.type === "remote_thumbnail") {
          pb.api.remotefiles.thumbnail(push);
          onecup.refresh();
        }
        if (push.type === "remote_file_request_confirmed") {
          pb.api.remotefiles.file_request_confirmed(push);
          return onecup.refresh();
        }
      }
    };
    return pb.ws.socket.onerror = function(e) {
      return set_timeout(10000, function() {
        return pb.api.listen_for_pushes();
      });
    };
  };

  pb.api.get_ip = function() {
    return pb.net.get_plain_text("https://api.ipify.org/", {}, function(r) {
      pb.api.ip = r;
      return console.log("ip address is", pb.api.ip);
    });
  };

  pb.signout = function(redirect) {
    if (redirect == null) {
      redirect = true;
    }
    track("sign_out");
    pb.account = void 0;
    pb.db.clear();
    document.cookie = 'api_key=; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    if (redirect) {
      return window.location = "/";
    }
  };

  pb.pb_oauth = function(parts, fn) {
    return pb.net.post("/oauth2/authorize", parts, (function(_this) {
      return function(r) {
        var msg, ref;
        if (r.error) {
          msg = ((ref = r.error) != null ? ref.message : void 0) || "Some error";
          return fn({
            error: msg
          });
        } else {
          return fn(r);
        }
      };
    })(this));
  };

  pb.become = function(who) {
    if (who.indexOf("@") !== -1) {
      return pb.become_via_email(who);
    } else {
      return pb.become_via_iden(who);
    }
  };

  become_account = function(data) {
    pb.db.clear();
    pb.account = {};
    pb.account.api_key = data.api_key;
    pb.db.set_simple("account", pb.account);
    return window.location.href = window.location.href;
  };

  pb.post_signin_reload = function() {
    var j, len, ref, suite;
    ref = pb.api.suites;
    for (j = 0, len = ref.length; j < len; j++) {
      suite = ref[j];
      suite.reset();
    }
    pb.reload();
    return pb.set_extention_cookie();
  };

  pb.reload = function() {
    pb.api.fetch_all();
    pb.set_desktop_cookie();
    return pb.api.listen_for_pushes();
  };

}).call(this);

// from 'src/crypto.js'
// Generated by CoffeeScript 1.10.0
(function() {
  pb.e2e = {
    enabled: false,
    error: false
  };

  pb.e2e.init = function() {
    var key_base64, md;
    pb.e2e.error = false;
    key_base64 = pb.db.get('e2e_key');
    if (key_base64) {
      pb.e2e.key = atob(key_base64);
      pb.e2e.enabled = true;
      md = forge.md.sha256.create();
      md.update(pb.e2e.key);
      return pb.e2e.key_fingerprint = forge.util.encode64(md.digest().getBytes());
    } else {
      delete pb.e2e.key;
      pb.e2e.enabled = false;
      return pb.e2e.key_fingerprint = null;
    }
  };

  pb.e2e.set_password = function(password) {
    var key, key_base64, md;
    if (password) {
      track("e2e_password");
      md = forge.md.sha256.create();
      key = forge.pkcs5.pbkdf2(password, pb.account.iden, 30000, 32, md);
      key_base64 = btoa(key);
      pb.db.set("e2e_key", key_base64);
    } else {
      pb.db.set("e2e_key", "");
    }
    return pb.e2e.init();
  };

  pb.e2e.encrypt = function(plaintext) {
    var bytes, cipher, iv, output;
    if (!plaintext) {
      return null;
    }
    bytes = forge.util.createBuffer(forge.util.encodeUtf8(plaintext));
    iv = forge.random.getBytes(12);
    cipher = forge.cipher.createCipher('AES-GCM', pb.e2e.key);
    cipher.start({
      'iv': iv
    });
    cipher.update(bytes);
    cipher.finish();
    output = forge.util.createBuffer();
    output.putBytes('1');
    output.putBytes(cipher.mode.tag.getBytes());
    output.putBytes(iv);
    output.putBytes(cipher.output.getBytes());
    return forge.util.encode64(output.getBytes());
  };

  pb.e2e.decrypt = function(encrypted) {
    var buffer, bytes, decipher, error, iv, tag;
    if (!encrypted) {
      return "";
    }
    if (!pb.e2e.key) {
      track("e2e_error");
      pb.e2e.error = true;
      return "";
    }
    bytes = forge.util.decode64(encrypted);
    buffer = forge.util.createBuffer(bytes);
    buffer.getBytes(1);
    tag = buffer.getBytes(16);
    iv = buffer.getBytes(12);
    decipher = forge.cipher.createDecipher('AES-GCM', pb.e2e.key);
    decipher.start({
      'iv': iv,
      'tag': tag
    });
    decipher.update(buffer);
    decipher.finish();
    try {
      return decipher.output.toString('utf8');
    } catch (error) {
      track("e2e_error");
      return pb.e2e.error = true;
    }
  };

}).call(this);

//# sourceMappingURL=crypto.js.map

// from 'src/dragndrop.js'
// Generated by CoffeeScript 1.10.0

/*
This file implements drag and drop for the website
 */

(function() {
  var drag_leave, drag_over, drop_file, paste_file, send_file;

  eval(onecup["import"]());

  pb.file_dragging = false;

  window.draw_file_drop = function() {
    return div("#file-drop-overlay", function() {
      position("fixed");
      z_index("10");
      top(0);
      left(0);
      width("100%");
      height("100%");
      background("rgba(255, 255, 255, .9)");
      return div(".text", function() {
        position("absolute");
        top(0);
        left(0);
        bottom(0);
        right(0);
        margin("auto");
        width(160);
        height(158);
        text_align("center");
        ({
          font_size: 20
        });
        font_weight("bold");
        icon(".icon-cloud-upload", function() {
          font_size(138);
          return color(colors.white2);
        });
        return text("Drop file here.");
      });
    });
  };

  drag_over = function(e) {
    if (!pb.pushform.showing && !pb.sms.form_showing) {
      return;
    }
    pb.file_dragging = true;
    e.stopPropagation();
    e.preventDefault();
    return onecup.refresh();
  };

  drag_leave = function(e) {
    if (!pb.pushform.showing && !pb.sms.form_showing) {
      return;
    }
    pb.file_dragging = false;
    e.stopPropagation();
    e.preventDefault();
    return onecup.refresh();
  };

  drop_file = function(e) {
    var file, files, i, len;
    if (!pb.pushform.showing && !pb.sms.form_showing) {
      return;
    }
    pb.file_dragging = false;
    e.stopPropagation();
    e.preventDefault();
    files = e.dataTransfer.files;
    for (i = 0, len = files.length; i < len; i++) {
      file = files[i];
      send_file(file);
    }
    return onecup.refresh();
  };

  document.addEventListener('dragleave', drag_leave, false);

  document.addEventListener('dragover', drag_over, false);

  document.addEventListener('drop', drop_file, false);

  paste_file = function(e) {
    var file, i, item, items, len, ref, ref1, ref2, results;
    items = (ref = e.clipboardData) != null ? ref.items : void 0;
    if (!items) {
      items = (ref1 = e.originalEvent) != null ? (ref2 = ref1.clipboardData) != null ? ref2.items : void 0 : void 0;
    }
    if (!items) {
      return;
    }
    results = [];
    for (i = 0, len = items.length; i < len; i++) {
      item = items[i];
      if (item.kind === "file") {
        file = item.getAsFile();
        e.stopPropagation();
        e.preventDefault();
        results.push(send_file(file));
      } else {
        results.push(void 0);
      }
    }
    return results;
  };

  send_file = function(file) {
    if (pb.pushform.showing) {
      return pb.api.pushes.send_file(file);
    } else if (pb.sms.form_showing) {
      return pb.sms.send_file(file);
    }
  };

  document.addEventListener('paste', paste_file, false);

}).call(this);

//# sourceMappingURL=dragndrop.js.map

// from 'src/views/templates.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var ios_page, main_page, old_links, page, page404, page500, page_no_account,
    slice = [].slice;

  eval(onecup["import"]());

  window.ICONS = {
    "note": "chat",
    "address": "map",
    "list": "list",
    "file": "clip",
    "link": "link"
  };

  window.views = {};

  css("#zero", function() {
    css(".one", function() {
      padding(20);
      return background("green");
    });
    return margin(100);
  });

  window.body = function() {
    return div("#zero", function() {
      var i, j, results;
      text_align("center");
      results = [];
      for (i = j = 0; j < 10; i = ++j) {
        results.push(div(".one.z", function() {
          width(100 + 50 * i);
          margin("0px auto");
          css(":hover", function() {
            return background("red");
          });
          div(".two", function() {
            padding(20);
            background("#BBB");
            return text(i);
          });
          return border("1px solid red");
        }));
      }
      return results;
    });
  };

  window.body = function() {
    var ref;
    pb.error.popup();
    switch (window.location.pathname) {
      case "/onecup-tests":
        onecup.tests();
        return;
      case "/physics-tests":
        onecup.physics_tests();
        return;
      case "/widget.html":
        views.widget();
        return;
      case "/oauth":
      case "/authorize":
        window.pb_oauth_page();
        return;
      case "/signin":
        views.pick_signin_type();
        return;
      case "/oauth-apps":
        views.oauth_apps();
        return;
      case "/login-success":
        views.login_success();
        return;
      case "/desktop_auth":
        views.desktop_auth();
        return;
      case "/subscribe":
        views.channel_auth();
        return;
      case "/thankyou":
        views.thankyou();
        return;
    }
    old_links();
    if (!pb.stuff_loaded) {
      pb.stuff_loaded = true;
      if (((ref = pb.account) != null ? ref.api_key : void 0) != null) {
        pb.reload();
      }
    }
    switch (window.location.pathname) {
      case "/channel-popup":
        views.channel_popup();
        return;
    }
    return div("#sink", function() {
      background_color(colors.white1);
      min_height(window.innerHeight);
      onclick(function() {
        pb.account_drop = false;
        return pb.drop_down = null;
      });
      return main_page();
    });
  };

  pb.pop_menu = function(e, dom, fn) {
    console.log("show pb.menu");
    pb.menu = {
      fn: fn,
      e: e,
      dom: dom
    };
    return e.stopPropagation();
  };

  window.error_body = function(e) {
    views.fake_header();
    page500(e);
    views.header();
    return views.footer();
  };

  main_page = function() {
    var ref;
    pb.pushform.showing = false;
    pb.sms.form_showing = false;
    if (pb.logging_in) {
      views.signing_in_spinner();
      return;
    }
    if (window.location.pathname === "/chat") {
      views.chat_head();
      return;
    }
    if ((ref = window.location.pathname) === "/" || ref === "/index.html") {
      if (pb.account != null) {
        views.pushbox();
        if (pb.file_dragging) {
          draw_file_drop();
        }
        return;
      }
    }
    views.header();
    views.fake_header();
    switch (window.location.pathname) {
      case "/":
      case "/index.html":
        if (pb.account != null) {

        } else {
          views.landing_page();
        }
        break;
      case "/blog":
        window.location = "https://blog.pushbullet.com";
        break;
      case "/api":
        window.location = "https://docs.pushbullet.com";
        break;
      case "/help":
        window.location = "https://help.pushbullet.com";
        break;
      case "/press-releases/pushbullet-announces-1.5-million-seed-round-lead-by-general-catalyst-releases-apps-for-apple-ios-mac-and-safari":
        page("press_releases/funding");
        break;
      case "/tos":
        page("tos");
        break;
      case "/auth_error":
        views.auth_error();
        break;
      case "/apps":
        views.apps_page();
        break;
      case "/support":
        views.support();
        break;
      case "/privacy":
        page("privacy");
        break;
      case "/press":
        page("press");
        break;
      case "/pro":
        views.pro_page();
        break;
      case "/paypal-payment-approve":
        views.paypal_payment_approve();
        break;
      case "/about":
        views.about_page();
        break;
      case "/unsubscribed":
        page("unsubscribed");
        break;
      case "/channels":
        views.channels();
        break;
      case "/channel":
        views.channel();
        break;
      case "/style-guide":
        views.style_guide();
        break;
      case "/pageroo":
        views.pageroo_page();
        break;
      case "/my-channel":
        views.my_channel();
        break;
      case "/my-channels":
        views.my_channels();
        break;
      default:
        page404();
    }
    return views.footer();
  };

  old_links = function() {
    switch (window.location.pathname) {
      case "/add-friend":
        return goto("/#people/new");
      case "/create-client":
        return goto("/#settings/clients");
      case "/account":
        return goto("/#settings/account");
    }
  };


  /*
  account_pages = ->
      div "#middle", ->
          switch window.location.pathname
              when "/pushes" then views.inbox()
              when "/push/note" then views.inbox("note")
              when "/push/file" then views.inbox("file")
              when "/push/link" then views.inbox("link")
              when "/account" then views.account_page()
  
              when "/add-friend" then views.new_chat()
              when "/new-chat" then views.new_chat()
  
              when "/edit-chats" then views.edit_chats()
  
              when "/edit-pushes" then views.edit_pushes()
              when "/edit-devices" then views.edit_devices()
              when "/edit-friends" then views.edit_friends()
              when "/edit-subscriptions" then views.edit_subscriptions()
              when "/edit-grants" then views.edit_grants()
              when "/create-client" then views.edit_clients() #views.create_client()
              when "/edit-clients" then views.edit_clients()
              when "/my-channel" then views.my_channel()
              when "/my-channels" then views.my_channels()
              else
                  page404()
   */

  window.icon = function() {
    var args;
    args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
    text(" ");
    onecup.i.apply(onecup, args);
    return text(" ");
  };

  window.circle_icon = function(icon_cls) {
    return span(".icon-stack", function() {
      icon(".icon-circle.icon-stack-base");
      return icon(icon_cls + ".icon-light");
    });
  };

  window.inner = function(def, fn) {
    return div(def, function() {
      return div(".inner", fn);
    });
  };

  page404 = function() {
    return inner(".page", function() {
      return h1(function() {
        return text("404 Page not found");
      });
    });
  };

  views.thankyou = function() {
    div(function() {
      position("absolute");
      top(0);
      right(0);
      left(0);
      bottom(0);
      background("url(/img/thankyou/confetti.gif)");
      background_color("white");
      return opacity(".5");
    });
    return div(function() {
      position("absolute");
      top("50%");
      transform("translateY(-50%)");
      width("100%");
      text_align("center");
      div(function() {
        font_size(40);
        margin(30);
        line_height(40);
        return text("Thank you very much!");
      });
      return div(function() {
        font_size(20);
        margin(30);
        color(colors.gray2);
        text("You are the ");
        span(function() {
          text("best");
          return onclick(function() {
            track("pug_click");
            return window.open("https://dl.pushbulletusercontent.com/3QReFq058LNFqlS0vl0AELoMfsAYaSIn/tumblr_nplo3wHrfd1upwzm1o1_500.jpg");
          });
        });
        return text("!");
      });
    });
  };

  page_no_account = function() {
    return inner(".page", function() {
      return h1(function() {
        return text("Your session has expired, please sign in again.");
      });
    });
  };

  pb.error = {
    message: ""
  };

  page500 = function(error) {
    var data, ref, ref1, ref2, ref3;
    data = error.stack + "\n===============================\nlocation: " + window.location.href + "\nbrowser: " + ((ref = pb.visit_info) != null ? ref.browser_name : void 0) + " " + ((ref1 = pb.visit_info) != null ? ref1.browser_version : void 0) + "\nplatform: " + ((ref2 = pb.visit_info) != null ? ref2.platform : void 0) + "\nuser_agent: " + ((ref3 = pb.visit_info) != null ? ref3.user_agent : void 0) + "\n===============================\n" + (tracking.log.join("\n"));
    return inner(".page", function() {
      var report_error;
      padding(40);
      background_color("white");
      box_shadow("0 0 8px rgba(0,0,0,.06),0 4px 16px rgba(0,0,0,.12)");
      track("error", {
        type: error.name,
        message: error.message,
        stack: error.stack
      });
      h1(function() {
        return text("Aw, Snap! An error.");
      });
      textarea({
        style: {
          width: "100%",
          height: "150px"
        },
        onkeyup: function(e) {
          return pb.error.message = e.target.value;
        },
        placeholder: "Please describe what you were doing so that we can fix the issue.",
        name: "error-report"
      });
      report_error = function() {
        return pb.api.error_report(pb.account.email, "Website Error", pb.error.message, data);
      };
      button(".btn", {
        onclick: report_error
      }, function() {
        return text("Submit");
      });
      div({
        style: {
          height: 100
        }
      });
      return textarea({
        style: "width:100%; height:400px;",
        readonly: true
      }, function() {
        return raw(data);
      });
    });
  };

  window.markdown_cache = {};

  views.markdown = function(page) {
    if (markdown_cache[page] == null) {
      markdown_cache[page] = "";
      pb.net.get_plain_text("/pages/" + page + '.md', {}, function(data) {
        if (data.error) {
          return markdown_cache[page] = "error: '/pages/" + page + ".md' not found";
        } else {
          return markdown_cache[page] = markdown.toHTML(data);
        }
      });
    }
    return raw(markdown_cache[page]);
  };

  page = function(file) {
    with_view("page." + file);
    return inner(".page.markdown", function() {
      padding("60px 120px 120px 120px");
      background("white");
      box_shadow("0 0 8px rgba(0,0,0,.06),0 4px 16px rgba(0,0,0,.12)");
      return views.markdown(file);
    });
  };

  ios_page = function() {
    return window.location = pb.URLS.ios;
  };

  pb.error = {};

  pb.error.alert = function(title, body) {
    pb.error.type = "alert";
    pb.error.title = title;
    pb.error.body = body;
    return refresh();
  };

  pb.error.banner = function(title, body) {
    pb.error.type = "banner";
    pb.error.title = title;
    pb.error.body = body;
    return refresh();
  };

  pb.error.clear = function() {
    pb.error.type = null;
    pb.error.title = null;
    return pb.error.body = null;
  };

  pb.error.popup = function() {
    return div("#errors", function() {
      if (pb.error.type === "banner") {
        div(".pointer", function() {
          padding(10);
          position("relative");
          z_index("100");
          background(colors.red);
          color("white");
          if (pb.error.title) {
            strong(function() {
              return text(pb.error.title);
            });
            text(": ");
          }
          span(function() {
            return text(pb.error.body);
          });
          icon(".pushfont-close", function() {
            position("absolute");
            font_size(30);
            top(10);
            return right(10);
          });
          return onclick(function() {
            return pb.error.clear();
          });
        });
      }
      if (pb.error.type === "alert") {
        return div(function() {
          display("flex");
          justify_content("center");
          align_items("center");
          height("100vh");
          return div(function() {
            border_radius(5);
            box_shadow("0px 0px 15px grey");
            padding(20);
            z_index("100");
            background("white");
            width(400);
            h1(function() {
              return text(pb.error.title);
            });
            p(function() {
              return text(pb.error.body);
            });
            return div(function() {
              padding(20);
              text_align("center");
              return button(function() {
                onclick(function() {
                  return pb.error.clear();
                });
                return text("dismiss");
              });
            });
          });
        });
      }
    });
  };

}).call(this);

// from 'src/crud.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var crud_input, crud_pic,
    indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  eval(onecup["import"]());

  window.crud = {};

  crud.complex = function(api, display_fields, edit_fields, extra_fn, create) {
    var display_buttons, display_field, display_new_object, display_object;
    if (create == null) {
      create = true;
    }
    display_object = function(object) {
      if (!object.active) {
        return;
      }
      return div(".object", function() {
        var f, i, len;
        padding_top(30);
        padding_bottom(100);
        if (extra_fn) {
          extra_fn(object);
        }
        for (i = 0, len = display_fields.length; i < len; i++) {
          f = display_fields[i];
          display_field(object, f);
        }
        return display_buttons(object);
      });
    };
    display_buttons = function(object) {
      var _delete_fn, _update_fn;
      _update_fn = function() {
        return api.update(object);
      };
      _delete_fn = function() {
        return api["delete"](object);
      };
      return div(".crud-buttons", function() {
        if (api.deleting === object.iden) {
          return button(".btn", function() {
            icon(".icon-spinner.icon-spin");
            return text("Deleting");
          });
        } else if (api.delete_check === object.iden) {
          button(".btn.red", {
            onclick: _delete_fn
          }, function() {
            return text("Delete");
          });
          return button(".btn", {
            onclick: (function() {
              return api.delete_check = false;
            })
          }, function() {
            return text("Cancel");
          });
        } else {
          if (create) {
            return button(".btn.hover-red", function() {
              text("Delete");
              return onclick(function() {
                return api.delete_check = object.iden;
              });
            });
          } else {
            return icon(".push-close.delete", function() {
              return onclick(function() {
                return api.delete_check = object.iden;
              });
            });
          }
        }
      });
    };
    display_field = function(object, field) {
      return div(".field." + field, function() {
        div(".label", function() {
          return text(field + ":");
        });
        return div(".content", function() {
          if (indexOf.call(edit_fields, field) >= 0) {
            return input({
              type: "text",
              placeholder: field,
              value: object[field],
              name: field,
              onchange: function(e) {
                return object[field] = e.target.value;
              },
              onblur: function(e) {
                object[field] = e.target.value;
                return api.update(object);
              },
              onkeypress: function(e) {
                if (e.which === 13) {
                  return e.target.blur();
                }
              }
            });
          } else {
            return div(".like-input", function() {
              var time;
              if (field === "created") {
                time = new moment(object[field] * 1000);
                return text(time.fromNow());
              } else {
                return text(object[field]);
              }
            });
          }
        });
      });
    };
    display_new_object = function(object) {
      return div("#new.object", function() {
        var field, fn1, i, len, new_obj;
        new_obj = api.new_obj;
        fn1 = function(field) {
          return div("." + field, function() {
            return div(".content", function() {
              return input({
                type: "text",
                placeholder: field,
                name: field,
                value: new_obj[field],
                onchange: function(e) {
                  return new_obj[field] = e.target.value;
                }
              });
            });
          });
        };
        for (i = 0, len = edit_fields.length; i < len; i++) {
          field = edit_fields[i];
          fn1(field);
        }
        return div(".crud-buttons", function() {
          if (api.creating) {
            return button(".btn", function() {
              icon(".icon-spinner.icon-spin");
              return text("Adding A New " + api.nice_name);
            });
          } else {
            return button(".btn.green", function() {
              text("Add A New " + api.nice_name);
              return onclick(function() {
                return api.create(new_obj);
              });
            });
          }
        });
      });
    };
    return div(".complex-crud", function() {
      if (!api.have_fetched) {
        icon(".icon-spinner.icon-spin");
        text("Loading " + api.nice_name + "s");
        return;
      }
      return div(".objects", function() {
        var i, len, object, ref;
        ref = api.all;
        for (i = 0, len = ref.length; i < len; i++) {
          object = ref[i];
          display_object(object);
        }
        if (create) {
          return display_new_object();
        }
      });
    });
  };

  crud.list = function(api, display_fn) {
    var display_buttons, display_object;
    display_object = function(object) {
      if (!object.active) {
        return;
      }
      return tr(function() {
        height(54);
        display_fn(object);
        return display_buttons(object);
      });
    };
    display_buttons = function(object) {
      var btn;
      btn = function(cls, fn) {
        return button(cls, function() {
          height(32);
          line_height(32);
          padding(0);
          margin(0);
          width(65);
          return fn();
        });
      };
      return td(function() {
        width(65 * 2 + 5);
        text_align("right");
        if (api.deleting === object.iden) {
          return btn(function() {
            icon(".icon-spinner.icon-spin");
            return text("Deleting");
          });
        } else if (api.delete_check === object.iden) {
          btn(".red", function() {
            onclick(function() {
              return api["delete"](object);
            });
            return text("Delete");
          });
          text(" ");
          return btn(".gray", function() {
            onclick(function() {
              return api.delete_check = false;
            });
            return text("Cancel");
          });
        } else {
          return btn(".hover-red", function() {
            onclick(function() {
              return api.delete_check = object.iden;
            });
            return text("Delete");
          });
        }
      });
    };
    if (!api.have_fetched) {
      icon(".icon-spinner.icon-spin");
      text("Loading " + api.nice_name + "s");
      return;
    }
    return table(".crud", function() {
      var i, len, object, ref, results;
      width("100%");
      white_space("nowrap");
      ref = api.all;
      results = [];
      for (i = 0, len = ref.length; i < len; i++) {
        object = ref[i];
        results.push(display_object(object));
      }
      return results;
    });
  };

  crud_pic = function(image_url) {
    return raw_img({
      src: image_url
    }, function() {
      display("inline-block");
      margin_top(6);
      width(32);
      height(32);
      return border_radius(16);
    });
  };

  crud_input = function(api, object, field) {
    padding_right(10);
    return input({
      type: "text",
      placeholder: field,
      value: object[field],
      name: field
    }, function() {
      onchange(function(e) {
        return object[field] = e.target.value;
      });
      onblur(function(e) {
        object[field] = e.target.value;
        return api.update(object);
      });
      return onkeypress(function(e) {
        if (e.which === 13) {
          return e.target.blur();
        }
      });
    });
  };

  views.edit_devices = function() {
    h2(function() {
      return text("Devices");
    });
    p(function() {
      return a({
        href: "https://help.pushbullet.com/articles/why-do-i-have-only-one-chrome-listed-in-my-devices-even-though-i-have-multiple-computers/"
      }, function() {
        return text("Browsers appear as one device even if on more than one computer.");
      });
    });
    return crud.list(pb.api.devices, function(device) {
      td(function() {
        return crud_pic(pb.api.devices.guess_icon(device));
      });
      td(function() {
        return crud_input(pb.api.devices, device, "nickname");
      });
      td(function() {
        if (pb.api.pinger.online[device.iden]) {
          return text("connected");
        } else {
          return text("");
        }
      });
      return td(function() {
        return text("added " + (new moment(device.created * 1000)).fromNow());
      });
    });
  };

  views.edit_chats = function() {
    h2(function() {
      return text("Conversations");
    });
    p(function() {
      text("Don't see someone? You can always ");
      a({
        href: "/#people/new"
      }, function() {
        return text("add them here");
      });
      return text(".");
    });
    return crud.list(pb.api.chats, function(chat) {
      td(function() {
        return crud_pic(chat["with"].image_url || pb.api.chats.default_image_url);
      });
      td(function() {
        var name;
        name = chat["with"].name;
        if (!name) {
          if (chat["with"].email) {
            name = chat["with"].email.split("@")[0];
          } else {
            name = "no name";
          }
        }
        return text(name);
      });
      return td(function() {
        return text(chat["with"].email);
      });
    });
  };

  views.edit_channels = function() {
    h2(function() {
      return text("Channels");
    });
    p(function() {
      return text("Channels are notification feeds you've created. Deleting the channel stops the notifications for all of its subscribers and cannot be undone.");
    });
    return crud.list(pb.api.channels, function(channel) {
      td(function() {
        return crud_pic(channel.image_url || pb.api.channels.default_image_url);
      });
      td(function() {
        button(function() {
          height(32);
          line_height(32);
          padding(0);
          margin(0);
          width(65);
          return text("Edit");
        });
        return onclick(function() {
          return goto(mk_url("my-channel", {
            tag: channel.tag
          }));
        });
      });
      td(function() {
        return text(channel.name);
      });
      return td(function() {
        return text(channel.tag);
      });
    });
  };

  views.edit_grants = function() {
    h2(function() {
      return text("Connected Apps");
    });
    p(function() {
      text("These are apps that you've given permission to access your Pushbullet account.");
      br();
      return text("Deleting the grant revokes access.");
    });
    return crud.list(pb.api.grants, function(grant) {
      td(function() {
        return crud_pic(grant.client.image_url || pb.api.grants.default_image_url);
      });
      td(function() {
        return text(grant.client.name);
      });
      td(function() {
        return text(grant.client.website_url);
      });
      return td(function() {
        var time;
        time = new moment(grant.created * 1000);
        return text(time.fromNow());
      });
    });
  };

  views.edit_blocks = function() {
    h2(function() {
      return text("Blocked People");
    });
    p(function() {
      return text("These are the people you have blocked. Deleting them from this page will unblock them.");
    });
    return crud.list(pb.api.blocks, function(block) {
      td(function() {
        return crud_pic(block.user.image_url || pb.api.chats.default_image_url);
      });
      td(function() {
        return text(block.user.name);
      });
      return td(function() {
        var time;
        time = new moment(block.created * 1000);
        return text(time.fromNow());
      });
    });
  };

}).call(this);

//# sourceMappingURL=crud.js.map

// from 'src/views/header.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var hamburger_menu, header_account_menu;

  eval(onecup["import"]());

  pb.header = {
    height: 90
  };

  pb.header.navs = [["APPS", "/apps"], ["CHANNELS", "/channels"], ["BLOG", "https://blog.pushbullet.com"], ["PRO", "/pro"], ["API", "https://docs.pushbullet.com"], ["HELP", "https://help.pushbullet.com"]];

  pb.drop_down_click = function(e, name) {
    e.stopPropagation();
    if (pb.drop_down !== name) {
      return pb.drop_down = name;
    } else {
      return pb.drop_down = null;
    }
  };

  views.fake_header = function() {
    return div(function() {
      width("100%");
      return height(pb.header.height);
    });
  };

  window.views.header = function(wide) {
    if (wide == null) {
      wide = false;
    }
    if (!pb.db.local_storage) {
      inner("#banner.red", function() {
        return text("A setting Pushbullet requires to work is disabled in your browser (Local Storage). Please contact us at hey@pushbullet.com.");
      });
    }
    if (typeof WebSocket === "undefined" || WebSocket === null) {
      inner("#banner.red", function() {
        return text("A setting Pushbullet requires to work is disabled in your browser (WebSocket). Please contact us at hey@pushbullet.com.");
      });
    }
    if ((pb.browser != null) && pb.browser.name === "IE" && parseInt(pb.browser.version) <= 9) {
      inner("#banner.red", function() {
        text("Sorry, we don't support Internet Explorer " + pb.browser.version + ". Upgrade to ");
        a({
          href: "https://www.google.com/intl/en/chrome/browser/"
        }, function() {
          return text("Chrome");
        });
        return text(".");
      });
    }
    if (window.innerWidth < 550) {
      return views.mobile_hader();
    } else {
      return views.desktop_header(wide);
    }
  };

  views.mobile_hader = function() {
    pb.header.height = 64;
    pb.header.mobile = true;
    return div("#mobile-header", function() {
      z_index("5");
      position("absolute");
      top(0);
      left(0);
      right(0);
      height(pb.header.height);
      box_shadow("0 0 4px rgba(0,0,0,.14),0 4px 8px rgba(0,0,0,.28)");
      background_color(colors.green2);
      text_align("center");
      img({
        src: "/img/header/mobilelogo.png",
        width: 160,
        height: 30
      }, function() {
        return margin_top(15);
      });
      if (location.hash.split("/").length !== 1 && window.innerWidth < 64 + 64 + 400) {
        icon(".pushfont-back.pointer", function() {
          display("block");
          position("absolute");
          top(0);
          left(0);
          width(64);
          height(64);
          color("white");
          font_size(40);
          line_height(64);
          text_align("center");
          css(":hover", function() {
            return background_color(colors.green3);
          });
          return onclick(function(e) {
            return goto("/");
          });
        });
      } else {
        icon(".pushfont-hamburger.pointer", function() {
          display("block");
          position("absolute");
          top(0);
          left(0);
          width(64);
          height(64);
          color("white");
          font_size(40);
          line_height(64);
          text_align("center");
          css(":hover", function() {
            return background_color(colors.green3);
          });
          return onclick(function(e) {
            pb.drop_down_click(e, "hamburger");
            return console.log("go buddy", pb.drop_down);
          });
        });
      }
      return hamburger_menu();
    });
  };

  hamburger_menu = function() {
    if (pb.drop_down !== "hamburger") {
      return;
    }
    return div("#hamburger_menu", function() {
      var fn, j, len, name, ref, ref1, url;
      z_index("6");
      position("absolute");
      top(pb.header.height);
      left(0);
      right(0);
      text_align("center");
      background(colors.green1);
      div(".menu-link", function() {
        padding(20);
        font_size(17);
        text_decoration("none");
        font_weight("bold");
        color("white");
        text("HOME");
        return onclick(function() {
          pb.drop_down = null;
          return goto("/");
        });
      });
      ref = pb.header.navs;
      fn = function(name, url) {
        return div(".menu-link.pointer", function() {
          padding(20);
          font_size(17);
          text_decoration("none");
          font_weight("bold");
          color("white");
          onclick(function() {
            goto(url);
            return pb.drop_down = null;
          });
          return text(name);
        });
      };
      for (j = 0, len = ref.length; j < len; j++) {
        ref1 = ref[j], name = ref1[0], url = ref1[1];
        fn(name, url);
      }
      return div(".menu-link", function() {
        padding(20);
        font_size(17);
        text_decoration("none");
        font_weight("bold");
        color("white");
        text("SIGN OUT");
        return onclick(function() {
          return pb.signout();
        });
      });
    });
  };

  views.desktop_header = function(wide) {
    pb.header.height = 80;
    pb.header.mobile = false;
    return div("#header", {
      style: {
        "-webkit-app-region": "drag"
      }
    }, function() {
      z_index("5");
      position("absolute");
      top(0);
      left(0);
      right(0);
      height(pb.header.height = 80);
      box_shadow("0 0 4px rgba(0,0,0,.14),0 4px 8px rgba(0,0,0,.28)");
      background_color(colors.green2);
      return div(".middle", function() {
        var account_drop;
        if (wide === false) {
          position("relative");
          width(960);
          margin("0px auto");
        }
        a(".logo", {
          href: "/"
        }, function() {
          position("absolute");
          top(10);
          left(10);
          return img({
            src: "/img/header/logo.png",
            width: "280px",
            height: "58px"
          });
        });
        div(".navigation", function() {
          var cls, j, len, name, ref, ref1, results, url;
          position("absolute");
          top(28);
          left(300);
          right(80);
          text_align("center");
          css_text_overflow();
          ref = pb.header.navs;
          results = [];
          for (j = 0, len = ref.length; j < len; j++) {
            ref1 = ref[j], name = ref1[0], url = ref1[1];
            if (url === window.location.pathname) {
              cls = ".nav-button.selected";
            } else {
              cls = ".nav-button";
            }
            results.push(a(cls, {
              href: url
            }, function() {
              font_size(17);
              font_weight("bold");
              color("white");
              margin_right(20);
              return text(name);
            }));
          }
          return results;
        });
        if (pb.account != null) {
          account_drop = function(e) {
            pb.account_drop = !pb.account_drop;
            e.stopPropagation();
            return refresh();
          };
          if (pb.account.image_url != null) {
            div("#account-btn.pointer.white", {
              style: {
                "background-image": "url('" + pb.account.image_url + "')"
              },
              onclick: account_drop
            });
          } else {
            div("#account-btn.pointer", {
              onclick: account_drop
            }, function() {
              return i(".push-friend");
            });
          }
          if (pb.account.pro) {
            img({
              src: "/img/pro/smallRibbon.png",
              width: 23,
              height: 34
            }, function() {
              position("absolute");
              right(5);
              return top(43);
            });
          }
          if (pb.account_drop === true) {
            return header_account_menu();
          }
        } else {
          return button("#sign-in-btn", function() {
            position("absolute");
            top(20);
            right(10);
            width(100);
            height(40);
            onclick(function() {
              return goto(mk_url("/signin", {
                next: "/"
              }));
            });
            return text("Sign In");
          });
        }
      });
    });
  };

  header_account_menu = function() {
    return div("#account-menu.menu", function() {
      div(".stem", function() {
        return icon(".icon-caret-up");
      });
      a({
        href: "/#settings/account"
      }, function() {
        return text("My Account");
      });
      a({
        href: "/#settings/invite"
      }, function() {
        return text("Invite Friends");
      });
      hr();
      return a(function() {
        onclick(function() {
          return pb.signout();
        });
        return text(" Sign Out");
      });
    });
  };

}).call(this);

//# sourceMappingURL=header.js.map

// from 'src/views/footer.js'
// Generated by CoffeeScript 1.10.0
(function() {
  eval(onecup["import"]());

  views.footer = function() {
    var divat, link;
    divat = function(x, y, fn) {
      return div(function() {
        position("absolute");
        top(x);
        left(y);
        return fn();
      });
    };
    link = function(href, name) {
      return div(function() {
        return a(".link", {
          href: href
        }, function() {
          text_decoration("none");
          color(colors.gray2);
          font_size(16);
          return text(name);
        });
      });
    };
    div("#footer", function() {
      height(140);
      if (location.pathname === "/pro") {
        background_color("#C9D1D7");
      } else {
        background_color(colors.gray1);
      }
      return div(".inner", function() {
        position("relative");
        margin("0px auto");
        width(960);
        height(140);
        color(colors.gray2);
        divat(52, 2, function() {
          font_size(20);
          return text("GET IT FOR:");
        });
        divat(35, 125, function() {
          a({
            href: pb.URLS.android
          }, function() {
            return img({
              src: "/img/footer/android.png",
              height: "60px",
              width: "60px"
            });
          });
          return a({
            href: pb.URLS.ios
          }, function() {
            return img({
              src: "/img/footer/iphone.png",
              height: "60px",
              width: "60px"
            });
          });
        });
        divat(40, 325, function() {
          link("/apps", "Apps");
          link("/channels", "Channels");
          return link("/pro", "Pro");
        });
        divat(40, 456, function() {
          link("https://docs.pushbullet.com/", "API");
          link("/press", "Press");
          return link("/about", "About Us");
        });
        divat(40, 580, function() {
          link("/privacy", "Privacy Policy");
          return link("/tos", "Terms of Service");
        });
        return div(function() {
          position("absolute");
          top(40);
          right(0);
          return div(".social", function() {
            a(".google-plus", {
              href: "https://plus.google.com/108578805501197929869",
              rel: "publisher"
            }, function() {
              return circle_icon(".icon-google-plus");
            });
            a(".twitter", {
              href: "https://twitter.com/pushbullet"
            }, function() {
              return circle_icon(".icon-twitter");
            });
            return a(".facebook", {
              href: "https://www.facebook.com/pages/PushBullet/235561209928697"
            }, function() {
              return circle_icon(".icon-facebook");
            });
          });
        });
      });
    });
    return views.support_fab();
  };

}).call(this);

// from 'src/views/style_guide.js'
// Generated by CoffeeScript 1.10.0
(function() {
  eval(onecup["import"]());

  views.style_guide = function() {
    var area;
    area = function(name, fn) {
      div(function() {
        background(colors.gray1);
        padding(20);
        margin_bottom(20);
        margin_top(20);
        return text(name);
      });
      return fn();
    };
    return inner(".page", function() {
      area("page types", function() {
        return text("this is a .page");
      });
      area("headings", function() {
        h1(function() {
          return text("h1 tag with a larger title");
        });
        h2(function() {
          return text("h2 tag with a larger title");
        });
        h3(function() {
          return text("h3 tag with a larger title");
        });
        h4(function() {
          return text("h4 tag with a larger title");
        });
        h5(function() {
          return text("h5 tag with a larger title");
        });
        return h6(function() {
          return text("h6 tag with a larger title");
        });
      });
      area("colors", function() {
        return div(function() {
          var color_box;
          overflow("hidden");
          color_box = function(c) {
            return div(function() {
              width(48);
              float("left");
              margin_right(20);
              div(function() {
                width(48);
                height(48);
                return background_color(c);
              });
              return div(function() {
                font_size(12);
                return text(c);
              });
            });
          };
          color_box(colors.gray1);
          color_box(colors.gray2);
          color_box(colors.gray3);
          color_box(colors.gray4);
          color_box(colors.green1);
          color_box(colors.green2);
          color_box(colors.green3);
          color_box(colors.red);
          color_box(colors.white1);
          color_box(colors.white2);
          return color_box(colors.white3);
        });
      });

      /*
      window.colors =
          gray1: "#ecf0f0"
          gray2: "#95a5a6"
          gray3: "#5c6868"
          gray4: "#232a2a"
      
          green1: "#6ec07c"
          green2: "#4ab367"
          green3: "#38a06d"
      
          teal:   "#009688"
          indigo: "#3f51b5"
          red:    "#e85845"
      
          white1: "#ecf0f0"
          white2: "#CED1D5"
          white3: "#B0BAB9"
      
      colors.me = colors.gray1
      colors.other = "#7c94a1"
      colors.other_sms = "#579697"
       */
      area("text", function() {
        p(function() {
          return text("this is a p peragraph thing");
        });
        p(function() {
          return text("Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aenean tempus sem magna, eu vulputate neque dictum a. Suspendisse sed sagittis dui. Vivamus eros sapien, placerat sed dignissim at, mollis hendrerit ligula. Etiam et diam vitae libero pretium mollis. Proin et mauris massa. Aenean eu sapien vel sapien ornare sagittis id nec ex. Phasellus porttitor neque turpis, sed hendrerit dolor porta in. Sed eget felis massa. Sed sit amet augue iaculis, pellentesque magna vel, auctor diam. Pellentesque varius ipsum lectus, in posuere diam suscipit quis. Nulla et tellus lacus. Fusce erat felis, euismod vitae varius sit amet, porta sit amet ex. Pellentesque vestibulum laoreet dui non aliquam. Vestibulum a euismod lectus, ut viverra dolor.");
        });
        p(".gray", function() {
          return text("Nam aliquet nunc felis, vitae blandit mauris commodo eget. Morbi convallis sapien consectetur odio varius, nec elementum nisl dignissim. Etiam magna ligula, faucibus ut consectetur in, tincidunt vitae elit. Pellentesque lobortis eros vel ex malesuada sagittis. Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Donec quis porttitor ex. Duis mi nunc, sollicitudin ac libero ut, faucibus malesuada purus.");
        });
        p(function() {
          return a({
            href: "#"
          }, function() {
            return text("this is a link");
          });
        });
        p(function() {
          text("this is ");
          return b(function() {
            return text("bold");
          });
        });
        return p(function() {
          text("this is ");
          return em(function() {
            return text("<em> tag");
          });
        });
      });
      area("buttons", function() {
        button(function() {
          return text("this a button");
        });
        button(".green", function() {
          return text("this a .green button ");
        });
        button(".red", function() {
          return text("this a .red button");
        });
        return button(".hover-red", function() {
          return text("this a .hover-red button");
        });
      });
      return area("inputs", function() {
        input({
          type: "text",
          disabled: true,
          placeholder: "input type here"
        });
        input({
          type: "text",
          placeholder: "input type here"
        });
        return textarea({
          placeholder: "text area type here"
        });
      });
    });
  };

  views.pageroo_page = function() {
    return inner(".page", function() {
      var pages;
      width("100%");
      pages = ["/index.html", "/error.html", "/signin", "/about", "/api", "/blog", "/help", "/press-releases/pushbullet-announces-1.5-million-seed-round-lead-by-general-catalyst-releases-apps-for-apple-ios-mac-and-safari", "/tos", "/privacy", "/unsubscribed", "/auth_error", "/security", "/apps", "/get-started", "/oauth?client_id=TzbA9FrZNU7krusOHrTbEy7Wj7LR8YC2&redirect_uri=https%3A%2F%2Fifttt.com%2Fchannels%2Fpushbullet%2Fauthorize&response_type=code&scope=ifttt&state=H4Hg_rNlcUT60ph6ghTomQ", "/press", "/apple", "/channels", "/authorize", "/oauth-apps", "/support", "/create-client", "/channel?tag=humblebundle", "/widget.html#channel=rimworld&code=3244&widget=card&size=small", "/style-guide", "/#people", "/#devices", "/#following", "/#settings"];
      pages = ["/#people", "/#people/me", "/#people/new", "/#devices", "/#devices/new", "/#following", "/#settings", "/#settings/account", "/#settings/history", "/#settings/devices", "/#settings/people", "/#settings/grants", "/#settings/clients"];
      return div(function() {
        var i, j, len, page, results;
        results = [];
        for (i = j = 0, len = pages.length; j < len; i = ++j) {
          page = pages[i];
          results.push(div(function() {
            display("inline-block");
            margin(5);
            width(1000 * .25);
            height(1000 * .25);
            overflow("hidden");
            div(function() {
              return a({
                href: page,
                target: "_blank"
              }, function() {
                return text(page.slice(0, 30));
              });
            });
            return iframe({
              src: page
            }, function() {
              width(1000);
              height(1000);
              margin_top(-375);
              margin_left(-375);
              return transform("scale(.25, .25)");
            });
          }));
        }
        return results;
      });
    });
  };

}).call(this);

// from 'src/views/style.js'
// Generated by CoffeeScript 1.10.0
(function() {
  eval(onecup["import"]());

  window.colors = {
    gray1: "#ecf0f0",
    gray2: "#95a5a6",
    gray3: "#5c6868",
    gray4: "#232a2a",
    green1: "#6ec07c",
    green2: "#4ab367",
    green3: "#38a06d",
    teal: "#009688",
    indigo: "#3f51b5",
    red: "#e85845",
    error: "#f6beb6",
    white1: "#ecf0f0",
    white2: "#CED1D5",
    white3: "#B0BAB9"
  };

  colors.me = colors.gray1;

  colors.other = "#7c94a1";

  colors.other_sms = "#579697";

  window.css_text_overflow = function() {
    text_overflow("ellipsis");
    white_space("nowrap");
    return overflow("hidden");
  };

  window.grid_layout = function(args) {
    return div(function() {
      var column, element, elements, i, index, j, len, len1, per_row, ref, results, row, rows;
      position("relative");
      row = 0;
      column = 0;
      per_row = Math.floor(args.width / args.element_width);
      if (per_row < 1) {
        per_row = 1;
      }
      if (per_row > args.max) {
        per_row = args.max;
      }
      if (per_row > 4) {
        per_row = 4;
      }
      if (per_row > args.elements.length) {
        per_row = args.elements.length;
      }
      rows = [];
      row = [];
      ref = args.elements;
      for (index = i = 0, len = ref.length; i < len; index = ++i) {
        element = ref[index];
        row.push(element);
        if (row.length >= per_row) {
          rows.push(row);
          row = [];
        }
      }
      if (row.length > 0) {
        rows.push(row);
      }
      width(args.width);
      height(rows.length * args.element_height);
      results = [];
      for (column = j = 0, len1 = rows.length; j < len1; column = ++j) {
        elements = rows[column];
        results.push((function() {
          var k, len2, results1;
          results1 = [];
          for (row = k = 0, len2 = elements.length; k < len2; row = ++k) {
            element = elements[row];
            results1.push(div(function() {
              var left_margin;
              left_margin = (args.width - elements.length * args.element_width) / 2;
              position("absolute");
              top(column * args.element_height);
              left(left_margin + row * args.element_width);
              row += 1;
              if (row >= per_row) {
                row = 0;
                column += 1;
              }
              return args.draw(element);
            }));
          }
          return results1;
        })());
      }
      return results;
    });
  };

}).call(this);

//# sourceMappingURL=style.js.map

// from 'src/views/targets.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var capitalize, contains, delete_text, draw_menu, draw_menu_arrow, draw_mute_badge, draw_own_badge, draw_unread_count, hex, recent_pushes_info, target_sort, to_contact_name, to_device_name, userpic;

  eval(onecup["import"]());

  pb.search = {};

  pb.search.type = "target";

  pb.targets = {};

  pb.search.q = "";

  capitalize = function(s) {
    return s[0].toUpperCase() + s.slice(1);
  };

  target_sort = function(a, b) {
    var a_name, a_time, b_name, b_time, ref, ref1;
    b_time = ((ref = b.info) != null ? ref.recent : void 0) || 0;
    a_time = ((ref1 = a.info) != null ? ref1.recent : void 0) || 0;
    if (a_time !== 0 || b_time !== 0) {
      return b_time - a_time;
    } else {
      a_name = a.name || "";
      b_name = b.name || "";
      return a_name.localeCompare(b_name);
    }
  };

  pb.targets.generate = function() {
    var channel, chat, device, grant, i, j, k, l, len, len1, len2, len3, len4, m, ref, ref1, ref2, ref3, ref4, sub, targets;
    targets = [];
    ref = pb.api.devices.all;
    for (i = 0, len = ref.length; i < len; i++) {
      device = ref[i];
      if (device.pushable) {
        targets.push(pb.targets.make(device));
      }
    }
    ref1 = pb.api.chats.all;
    for (j = 0, len1 = ref1.length; j < len1; j++) {
      chat = ref1[j];
      targets.push(pb.targets.make(chat));
    }
    ref2 = pb.api.channels.all;
    for (k = 0, len2 = ref2.length; k < len2; k++) {
      channel = ref2[k];
      targets.push(pb.targets.make(channel));
    }
    ref3 = pb.api.grants.all;
    for (l = 0, len3 = ref3.length; l < len3; l++) {
      grant = ref3[l];
      targets.push(pb.targets.make(grant));
    }
    ref4 = pb.api.subscriptions.all;
    for (m = 0, len4 = ref4.length; m < len4; m++) {
      sub = ref4[m];
      targets.push(pb.targets.make(sub));
    }
    return targets;
  };

  pb.targets.devices = function() {
    var device, i, len, ref, targets;
    targets = [];
    ref = pb.api.devices.all;
    for (i = 0, len = ref.length; i < len; i++) {
      device = ref[i];
      if (device.pushable) {
        targets.push(pb.targets.make(device));
      }
    }
    targets = targets.sort(target_sort);
    return targets;
  };

  pb.targets.chats = function() {
    var chat, i, len, ref, targets;
    targets = [];
    ref = pb.api.chats.all;
    for (i = 0, len = ref.length; i < len; i++) {
      chat = ref[i];
      targets.push(pb.targets.make(chat));
    }
    targets = targets.sort(target_sort);
    return targets;
  };

  pb.targets.subscriptions = function() {
    var channel, grant, i, j, k, len, len1, len2, own_channel, ref, ref1, ref2, subscription, targets;
    targets = [];
    ref = pb.api.channels.all;
    for (i = 0, len = ref.length; i < len; i++) {
      channel = ref[i];
      targets.push(pb.targets.make(channel));
    }
    own_channel = function(channel) {
      var c, j, len1, ref1;
      ref1 = pb.api.channels.all;
      for (j = 0, len1 = ref1.length; j < len1; j++) {
        c = ref1[j];
        if (c.iden === channel.iden) {
          return true;
        }
      }
      return false;
    };
    ref1 = pb.api.subscriptions.all;
    for (j = 0, len1 = ref1.length; j < len1; j++) {
      subscription = ref1[j];
      if (!own_channel(subscription.channel)) {
        targets.push(pb.targets.make(subscription));
      }
    }
    ref2 = pb.api.grants.all;
    for (k = 0, len2 = ref2.length; k < len2; k++) {
      grant = ref2[k];
      targets.push(pb.targets.make(grant));
    }
    targets = targets.sort(target_sort);
    return targets;
  };

  to_device_name = function(device) {
    if (device.nickname) {
      return device.nickname;
    } else if (device.model) {
      if (device.model.indexOf(device.manufacturer) === -1) {
        return capitalize(device.manufacturer) + " " + device.model;
      }
      return device.model;
    }
    return "nameless";
  };

  to_contact_name = function(contact) {
    if (contact.name) {
      return contact.name;
    } else {
      return contact.email;
    }
  };

  hex = function(int, n) {
    var s;
    s = int.toString(16);
    while (s.length < n) {
      s = "0" + s;
    }
    return s;
  };

  userpic = function(obj) {
    var code, n, t;
    t = (obj["with"].name || obj["with"].email).toUpperCase();
    code = t.charCodeAt(0);
    n = Math.floor(parseFloat(obj.created)) % 5;
    return "/img/userpics/" + n + "-" + hex(code, 4) + ".png";
  };

  recent_pushes_info = function(target) {
    var blurb, count, i, len, number_on_page, push, recent, ref;
    blurb = "";
    count = 0;
    recent = 0;
    number_on_page = 0;
    ref = pb.api.pushes.all;
    for (i = 0, len = ref.length; i < len; i++) {
      push = ref[i];
      if (pb.pushes.filter(target, push)) {
        number_on_page += 1;
        if (blurb === "") {
          blurb = push.title || push.body || push.url || push.file_name;
        }
        if (pb.api.pushes.should_notify(push)) {
          count += 1;
        }
        if (push.created > recent) {
          recent = push.created;
        }
      }
    }
    return {
      blurb: blurb,
      count: count,
      recent: recent
    };
  };

  pb.targets.make = function(obj, force_type) {
    var ref, target, type;
    if (force_type == null) {
      force_type = false;
    }
    if (force_type) {
      target = {
        name: obj.email,
        desc: "",
        image_url: pb.api.contacts.default_image_url,
        type: force_type,
        obj: obj
      };
      return target;
    }
    target = null;
    ref = pb.api.iden_to_type_object(obj.iden), type = ref[0], obj = ref[1];
    if (!obj || !type) {
      return null;
    }
    if (type === "chat") {
      target = {
        name: obj["with"].name || obj["with"].email,
        desc: obj["with"].email,
        image_url: obj["with"].image_url,
        url: "/#people/" + obj["with"].email
      };
    } else if (type === "device") {
      target = {
        name: to_device_name(obj),
        desc: obj.model,
        image_url: pb.api.devices.guess_icon(obj),
        url: "/#devices/" + obj.iden
      };
    } else if (type === "subscription") {
      target = {
        name: obj.channel.name || "blank " + type,
        desc: obj.channel.tag,
        image_url: obj.channel.image_url || pb.api.channels.default_image_url,
        url: "/#following/" + obj.channel.tag
      };
    } else if (type === "channel") {
      target = {
        name: obj.name || "blank " + type,
        desc: "your channel",
        image_url: obj.image_url || pb.api.channels.default_image_url,
        url: "/#following/" + obj.tag
      };
    } else if (type === "grant") {
      target = {
        name: obj.client.name || "blank " + type,
        desc: obj.client.email,
        image_url: obj.client.image_url || pb.api.grants.default_image_url,
        url: "/#following/" + obj.iden
      };
    }
    target.type = type;
    target.obj = obj;
    target.info = recent_pushes_info(target);
    return target;
  };

  pb.targets.make_ac_target = function(ac) {
    return {
      name: ac.name,
      desc: ac.email,
      email: ac.email,
      type: "email",
      is_user: ac.is_user,
      obj: {
        iden: -1
      },
      image_url: ac.image_url || pb.api.contacts.default_image_url
    };
  };

  pb.targets.make_email = function(email) {
    return {
      name: email,
      desc: email,
      email: email,
      type: "email",
      obj: {
        iden: -1
      },
      image_url: "/img/deviceicons/email.png"
    };
  };

  pb.targets.make_phone = function(phone) {
    return {
      name: phone,
      desc: phone,
      phone: phone,
      type: "phone",
      obj: {
        iden: -1
      },
      image_url: "/img/deviceicons/phone.png"
    };
  };

  pb.targets.by_email = function(email) {
    var chat, i, len, ref;
    ref = pb.api.chats.all;
    for (i = 0, len = ref.length; i < len; i++) {
      chat = ref[i];
      if (chat["with"].email === email || chat["with"].email_normalized === email) {
        return pb.targets.make(chat);
      }
    }
  };

  pb.targets.by_device_iden = function(iden) {
    var device, i, len, ref;
    ref = pb.api.devices.all;
    for (i = 0, len = ref.length; i < len; i++) {
      device = ref[i];
      if (device.iden === iden) {
        return pb.targets.make(device);
      }
    }
  };

  pb.targets.by_tag = function(tag) {
    var channel, grant, i, j, k, len, len1, len2, ref, ref1, ref2, subscription;
    ref = pb.api.channels.all;
    for (i = 0, len = ref.length; i < len; i++) {
      channel = ref[i];
      if (channel.tag === tag) {
        return pb.targets.make(channel);
      }
    }
    ref1 = pb.api.subscriptions.all;
    for (j = 0, len1 = ref1.length; j < len1; j++) {
      subscription = ref1[j];
      if (subscription.channel.tag === tag) {
        return pb.targets.make(subscription);
      }
    }
    ref2 = pb.api.grants.all;
    for (k = 0, len2 = ref2.length; k < len2; k++) {
      grant = ref2[k];
      if (grant.iden === tag) {
        return pb.targets.make(grant);
      }
    }
  };

  contains = function(a, b) {
    a = (a != null ? a.toLowerCase() : void 0) || "";
    b = (b != null ? b.toLowerCase() : void 0) || "";
    return a.indexOf(b) !== -1;
  };

  pb.targets.match = function(target) {
    var f, i, len, ref;
    ref = ["name", "desc"];
    for (i = 0, len = ref.length; i < len; i++) {
      f = ref[i];
      if (target[f] && contains(target[f], pb.search.q)) {
        return true;
      }
    }
    return false;
  };

  views.draw_target = function(target) {
    var arrow_width;
    if (pb.pushbox.width_sidebar > 200) {
      arrow_width = 40;
    } else {
      arrow_width = 0;
    }
    div(".target.pointer", function() {
      var image_url, ref, ref1, ref2, ref3, ref4, ref5, selected;
      height(60);
      position("relative");
      onclick(function() {
        track("target_select", {
          type: target.type
        });
        pb.sidebar.expanded = null;
        return goto(target.url);
      });
      ondblclick(function() {
        return console.log(target.type, target.obj);
      });
      if ((ref = target.obj) != null ? ref.iden : void 0) {
        selected = ((ref1 = pb.sidebar.target) != null ? (ref2 = ref1.obj) != null ? ref2.iden : void 0 : void 0) === ((ref3 = target.obj) != null ? ref3.iden : void 0);
        if (selected) {
          background("white");
        }
      }
      image_url = target.image_url;
      if (pb.api.blocks.by_email((ref4 = target.obj["with"]) != null ? ref4.email : void 0)) {
        image_url = "/img/deviceicons/blocked.png";
      }
      raw_img({
        src: image_url
      }, function() {
        position("absolute");
        top(10);
        left(12);
        width(32);
        height(32);
        return border_radius(16);
      });
      if (target.obj.muted === true) {
        draw_mute_badge();
      }
      if (target.type === "channel") {
        draw_own_badge(target.obj);
      }
      if (!selected && ((ref5 = target.info) != null ? ref5.count : void 0) > 0) {
        draw_unread_count(target.info.count);
      }
      if (pb.pushbox.width_sidebar > 100) {
        div(function() {
          position("absolute");
          top(4);
          left(12 + 32 + 12);
          right(arrow_width);
          font_size(18);
          color(colors.gray3);
          css_text_overflow();
          return text(target.name);
        });
        div(function() {
          var ref6, ref7;
          position("absolute");
          top(30);
          left(12 + 32 + 12);
          right(arrow_width);
          font_size(12);
          color(colors.gray2);
          css_text_overflow();
          if (((ref6 = target.info) != null ? ref6.count : void 0) > 0) {
            font_weight("bold");
          }
          return text((ref7 = target.info) != null ? ref7.blurb : void 0);
        });
      }
      if (arrow_width > 0 && selected) {
        if (target.type !== "email" && target.type !== "phone") {
          return draw_menu_arrow(target);
        }
      }
    });
    return draw_menu(target);
  };

  pb.targets.delete_check_iden = null;

  pb.targets.block_check_iden = null;

  delete_text = function(target) {
    if (target.type === "subscription") {
      return text("Unsubscribe");
    } else if (target.type === "chat") {
      return text("Hide");
    } else {
      return text("Delete");
    }
  };

  draw_menu = function(target) {
    var obj, ref;
    obj = target.obj;
    if (((ref = pb.sidebar.expanded) != null ? ref.iden : void 0) === obj.iden) {
      return div(function() {
        var ref1;
        text_align("right");
        background_color("white");
        padding(10);
        if (pb.targets.delete_check_iden === obj.iden) {
          button(".red", function() {
            delete_text(target);
            return onclick(function() {
              var ref1;
              track("target_hide", {
                type: target.type
              });
              if ((ref1 = pb.api[target.type + "s"]) != null) {
                ref1["delete"](target.obj);
              }
              return goto(pb.sidebar.tab.url);
            });
          });
          nbsp(2);
          return button(function() {
            text("Cancel");
            return onclick(function() {
              return pb.targets.delete_check_iden = null;
            });
          });
        } else if (pb.targets.block_check_iden === obj.iden) {
          button(".red", function() {
            text("Block");
            return onclick(function() {
              var ref1;
              track("target_block", {
                type: target.type
              });
              pb.api.blocks.block(target.obj["with"].email);
              if ((ref1 = pb.api[target.type + "s"]) != null) {
                ref1["delete"](target.obj);
              }
              return goto(pb.sidebar.tab.url);
            });
          });
          nbsp(2);
          button(function() {
            text("Cancel");
            return onclick(function() {
              return pb.targets.block_check_iden = null;
            });
          });
          nbsp(2);
          return button(".hover-red", function() {
            delete_text(target);
            return onclick(function() {
              return pb.targets.delete_check_iden = obj.iden;
            });
          });
        } else {
          if (target.type === "device") {

          } else {
            button(function() {
              onclick(function() {
                obj.muted = !obj.muted;
                return pb.api[target.type + "s"].update(obj);
              });
              if (obj.muted) {
                return text("Unmute");
              } else {
                return text("Mute");
              }
            });
            if (((ref1 = target.obj["with"]) != null ? ref1.email : void 0) != null) {
              nbsp(2);
              button(function() {
                if (pb.api.blocks.by_email(target.obj["with"].email)) {
                  text("Unblock");
                  return onclick(function() {
                    return pb.api.blocks.unblock(target.obj["with"].email);
                  });
                } else {
                  text("Block");
                  return onclick(function() {
                    return pb.targets.block_check_iden = obj.iden;
                  });
                }
              });
            }
          }
          nbsp(2);
          return button(".hover-red", function() {
            delete_text(target);
            return onclick(function() {
              return pb.targets.delete_check_iden = obj.iden;
            });
          });
        }
      });
    }
  };

  css(".target .downarrow", function() {
    color("transparent");
    return transition(".25s");
  });

  css(".target:hover .downarrow", function() {
    return color(colors.gray2);
  });

  draw_menu_arrow = function(target) {
    return div(".downarrow", function() {
      var ref;
      position("absolute");
      top(15);
      right(10);
      if (((ref = pb.sidebar.expanded) != null ? ref.iden : void 0) === target.obj.iden) {
        icon(".pushfont-upcaret");
      } else {
        icon(".pushfont-downcaret");
      }
      return onclick(function(e) {
        if (pb.sidebar.expanded) {
          pb.sidebar.expanded = null;
        } else {
          track("target_menu", {
            type: target.type
          });
          pb.sidebar.expanded = target.obj;
        }
        e.stopPropagation();
        return e.preventDefault();
      });
    });
  };

  draw_unread_count = function(count) {
    return div(".unread", function() {
      position("absolute");
      top(2);
      left(2);
      color("white");
      width(20);
      height(20);
      line_height(20);
      text_align("center");
      background_color(colors.red);
      border_radius(100);
      if (count > 9) {
        font_size(20);
        return icon(".pushfont-plus");
      } else {
        font_size(14);
        return text(count);
      }
    });
  };

  draw_own_badge = function(channel) {
    return div(".unread.pointer", function() {
      position("absolute");
      top(2);
      left(2);
      color("white");
      width(20);
      height(20);
      text_align("center");
      background_color(colors.green2);
      border_radius(100);
      line_height(21);
      icon(".pushfont-gear", function() {
        return font_size(19);
      });
      return onclick(function(e) {
        goto(mk_url("/my-channel", {
          tag: channel.tag
        }));
        e.preventDefault();
        return e.stopPropagation();
      });
    });
  };

  draw_mute_badge = function() {
    return div(".unread", function() {
      position("absolute");
      top(2);
      left(2);
      color("white");
      width(20);
      height(20);
      text_align("center");
      background_color(colors.red);
      border_radius(100);
      line_height(21);
      return icon(".pushfont-dash", function() {
        return font_size(19);
      });
    });
  };

}).call(this);

//# sourceMappingURL=targets.js.map

// from 'src/views/picker.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var in_match,
    bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  eval(onecup["import"]());

  in_match = (function(_this) {
    return function(a, b) {
      if ((a == null) || (b == null)) {
        return false;
      }
      return a.toLowerCase().indexOf(b.toLowerCase()) !== -1;
    };
  })(this);

  window.Picker = (function() {
    Picker.prototype.open = false;

    Picker.prototype.target = null;

    Picker.prototype.short_list = null;

    Picker.prototype.index = null;

    Picker.prototype.search = "";

    Picker.prototype.typing = false;

    function Picker(props) {
      this.props = props;
      this.draw_raw = bind(this.draw_raw, this);
      this.draw = bind(this.draw, this);
    }

    Picker.prototype.clear = function() {
      this.open = false;
      this.target = null;
      this.short_list = null;
      this.index = null;
      this.search = "";
      return this.typing = false;
    };

    Picker.prototype.draw = function(targets) {
      var i, len, select, set_text, target;
      select = (function(_this) {
        return function(target) {
          var base;
          set_text(target);
          _this.target = target;
          return typeof (base = _this.props).cb === "function" ? base.cb(target) : void 0;
        };
      })(this);
      set_text = (function(_this) {
        return function(target) {
          var input;
          if (!target) {
            return;
          }
          input = document.getElementById("picker-input");
          return input.value = target.name;
        };
      })(this);
      this.short_list = [];
      for (i = 0, len = targets.length; i < len; i++) {
        target = targets[i];
        if (!this.search || in_match(target.name, this.search) || in_match(target.email, this.search)) {
          this.short_list.push(target);
        }
      }
      if (this.props.email_suggest) {
        if (this.search.match(/.+\@.+\..+/)) {
          this.short_list.push(pb.targets.make_email(this.search));
        }
      }
      if (this.props.phone_suggest) {
        if (this.search.match(/[\d\s]+/)) {
          this.short_list.push(pb.targets.make_phone(this.search));
        }
      }
      return div("#picker", (function(_this) {
        return function() {
          return div(function() {
            position("relative");
            width("100%");
            background_color("white");
            if (!_this.open && _this.target) {
              div(".hover-lightgray.pointer", function() {
                height(48);
                width("100%");
                padding(8);
                line_height(32);
                onclick(function() {
                  var focus;
                  track("picker_open", {
                    type: _this.props.placeholder
                  });
                  _this.open = true;
                  focus = function() {
                    var picker_input;
                    picker_input = document.getElementById("picker-input");
                    if (_this.props.clear_on_click) {
                      picker_input.value = "";
                    }
                    return picker_input != null ? picker_input.focus() : void 0;
                  };
                  return setTimeout(focus, 30);
                });
                div(function() {
                  color(colors.gray2);
                  margin_left(4);
                  margin_right(10);
                  float("left");
                  return text(_this.props.label || "To");
                });
                return div(".chiclet", function() {
                  background_color(colors.gray1);
                  float("left");
                  height(32);
                  border_radius(16);
                  div(".icon", function() {
                    var image_url, ref, ref1;
                    display("block");
                    float("left");
                    image_url = (ref = _this.target) != null ? ref.image_url : void 0;
                    if (_this.index !== null) {
                      image_url = (ref1 = _this.short_list[_this.index]) != null ? ref1.image_url : void 0;
                    }
                    image_url = image_url || pb.api.chats.default_image_url;
                    return raw_img(".pic", {
                      src: image_url
                    }, function() {
                      width(32);
                      height(32);
                      return border_radius(16);
                    });
                  });
                  return div(function() {
                    height(32);
                    line_height(32);
                    font_size(18);
                    padding("0px 20px 0px 10px");
                    float("left");
                    display("block");
                    return text(_this.target.name);
                  });
                });
              });
            } else {
              input("#picker-input", {
                type: "text",
                placeholder: _this.props.placeholder,
                value: ""
              }, function() {
                padding(8);
                height(48);
                width("100%");
                border("none");
                onfocus(function(e) {
                  if (!e.target) {
                    return;
                  }
                  if (_this.props.clear_on_click) {
                    e.target.value = "";
                    e.target.select();
                  }
                  _this.open = true;
                  return _this.search = e.target.value;
                });
                onblur(function(e) {
                  var close_popup;
                  if (_this.open) {
                    close_popup = function() {
                      _this.open = false;
                      return refresh();
                    };
                    return setTimeout(close_popup, 300);
                  }
                });
                onkeyup(function(e) {
                  if (!e.target) {
                    return;
                  }
                  return _this.search = e.target.value;
                });
                return onkeydown(function(e) {
                  if (!e.target) {
                    return;
                  }
                  if (e.which === 38) {
                    if (_this.index === null) {
                      _this.index = _this.short_list.length - 1;
                    } else if (_this.index > 0) {
                      _this.index -= 1;
                    }
                    return e.preventDefault();
                  } else if (e.which === 40) {
                    if (_this.index === null) {
                      _this.index = 0;
                    } else if (_this.index < _this.short_list.length - 1) {
                      _this.index += 1;
                    }
                    return e.preventDefault();
                  } else if (e.which === 13 || e.which === 9) {
                    if (_this.index !== null) {
                      target = _this.short_list[_this.index];
                    } else if (_this.short_list.length > 0) {
                      target = _this.short_list[0];
                    } else {
                      e.preventDefault();
                      return;
                    }
                    select(target);
                    _this.open = false;
                    return e.preventDefault();
                  } else {
                    _this.open = true;
                    return _this.index = null;
                  }
                });
              });
            }
            if (_this.open && _this.short_list.length > 0) {
              return div("#picker-dorpdown", function() {
                var index, j, len1, ref, results;
                max_height(420);
                overflow_y("auto");
                position("absolute");
                z_index("2");
                if (_this.props.direction === "bottom") {
                  top(50);
                } else {
                  bottom(50);
                }
                left(30);
                right(30);
                background_color("white");
                border("1px solid " + colors.white2);
                box_shadow("0 0 8px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.12)");
                onwheel(function(e) {
                  return e.stopPropagation();
                });
                onscroll(function(e) {
                  return e.stopPropagation();
                });
                ref = _this.short_list;
                results = [];
                for (index = j = 0, len1 = ref.length; j < len1; index = ++j) {
                  target = ref[index];
                  results.push(_this.draw_raw(target, index, select));
                }
                return results;
              });
            }
          });
        };
      })(this));
    };

    Picker.prototype.draw_raw = function(target, index, select) {
      return div(".highlight.pointer", (function(_this) {
        return function() {
          position("relative");
          width("100%");
          height(50);
          if (_this.index === index) {
            background_color(colors.gray1);
          }
          onmousedown(function() {
            track("picker_select", {
              type: _this.props.placeholder
            });
            select(target);
            return _this.open = false;
          });
          div(".icon", function() {
            var image_url;
            position("absolute");
            top(10);
            left(10);
            image_url = target.image_url || pb.api.chats.default_image_url;
            return raw_img(".pic", {
              src: image_url
            }, function() {
              width(32);
              height(32);
              return border_radius(16);
            });
          });
          return div(function() {
            padding("12px 0px 3px 52px");
            width("100%");
            height(40);
            border("none");
            font_size(18);
            color(colors.gray3);
            text(target.name);
            white_space("nowrap");
            overflow("hidden");
            if (target.email && target.name !== target.email) {
              span(function() {
                color(colors.gray2);
                return text(" (" + target.email + ")");
              });
            }
            if (target.phone && target.name !== target.phone) {
              return span(function() {
                color(colors.gray2);
                return text(" (" + target.phone + ")");
              });
            }
          });
        };
      })(this));
    };

    return Picker;

  })();

}).call(this);

// from 'src/views/chats.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var draw_dailer_face, start_talking;

  eval(onecup["import"]());

  pb.chats = {};

  pb.chats.picker = new Picker({
    direction: "bottom",
    placeholder: "Find your friends",
    email_suggest: true,
    cb: start_talking
  });

  start_talking = function() {
    console.log("start talking to ", pb.chats.picker.target);
    if (pb.chats.picker.target === null) {
      if (pb.chats.picker.search.match(/.+\@.+\..+/)) {
        return goto("#people/" + pb.chats.picker.search);
      }
    } else {
      return goto("#people/" + pb.chats.picker.target.email);
    }
  };

  views.new_chat = function() {
    div(".search-area", function() {
      position("relative");
      z_index("1");
      width(520);
      margin("75px auto 100px auto");
      div(function() {
        font_size(18);
        color(colors.gray3);
        return text("Start a new conversation with:");
      });
      div(function() {
        var targets;
        position("relative");
        margin("15px 0px");
        border("1px solid " + colors.white2);
        targets = pb.api.autocomplete.targets(pb.chats.picker.search);
        return pb.chats.picker.draw(targets);
      });
      return div(function() {
        float("right");
        return button(".green", function() {
          width(137);
          height(38);
          text("Start talking");
          return onclick(start_talking);
        });
      });
    });
    return grid_layout({
      width: pb.pushbox.width_mainbar,
      element_width: 180,
      element_height: 200,
      max: 3,
      elements: pb.api.autocomplete.suggest_targets(),
      draw: draw_dailer_face
    });
  };

  draw_dailer_face = function(target) {
    return div(".hover-fade", function() {
      width(180);
      height(200);
      text_align("center");
      onclick(function() {
        track("chats_new");
        return goto("#people/" + target.email);
      });
      div(function() {
        var img_url;
        position("absolute");
        top(0);
        right(35);
        if (target.is_user) {
          img_url = "/img/deviceicons/pushbullet.png";
        } else {
          img_url = "/img/deviceicons/email.png";
        }
        return raw_img({
          src: img_url
        }, function() {
          width(34);
          height(34);
          border_radius(100);
          return border("2px solid white");
        });
      });
      div(function() {
        var img_url;
        img_url = target.image_url || pb.api.contacts.default_image_url;
        return raw_img({
          src: img_url
        }, function() {
          width(100);
          height(100);
          return border_radius(50);
        });
      });
      div(function() {
        margin_top(10);
        font_size(16);
        color(colors.gray3);
        return text(target.name);
      });
      div(function() {
        margin_top(5);
        font_size(12);
        color(colors.gray3);
        return text(target.email);
      });
      return div(function() {
        margin(5);
        font_size(14);
        color(colors.gray2);
        return text(target.desc);
      });
    });
  };

}).call(this);

// from 'src/views/sms.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var android_app_needs_upgrade, belongs_in_thread, draw_push_image, draw_sms_push, draw_sms_pushes, draw_thread, new_sms, push_image, push_name, recipient_image, sms_needs_e2e, thread_image, thread_names;

  eval(onecup["import"]());

  pb.sms = {};

  pb.sms.q = [];

  pb.sms.message_time_out = 30000;

  pb.sms.count = 0;

  pb.sms.form_showing = false;

  pb.sms.picker = new Picker({
    direction: "bottom",
    placeholder: "Select device",
    clear_on_click: true,
    label: "Phone",
    cb: function(target) {
      goto("/#sms/" + target.obj.iden);
      pb.api.sms.threads = [];
      pb.api.sms.thread = [];
      pb.api.sms.current_thread = null;
      return pb.sms.wants_thread_id = null;
    }
  });

  pb.sms.send = function(message) {
    var addresses, guid, push, r;
    if (message === "") {
      return;
    }
    addresses = (function() {
      var j, len, ref, results;
      ref = pb.api.sms.current_thread.recipients;
      results = [];
      for (j = 0, len = ref.length; j < len; j++) {
        r = ref[j];
        results.push(r.address);
      }
      return results;
    })();
    guid = pb.rand_iden();
    setTimeout(onecup.refresh, pb.sms.message_time_out + 1000);
    push = {
      target: pb.sms.target,
      addresses: addresses,
      ghost: true,
      timestamp: Date.now() / 1000,
      direction: "outgoing",
      body: message,
      guid: guid,
      thread_id: pb.api.sms.current_thread.id
    };
    pb.api.texts.send(push.target.obj, push.addresses, push.body, push.guid, push.thread_id);
    return pb.sms.q.push(push);
  };

  pb.sms.send_new = function() {
    var guid, input, phone_number, ref;
    phone_number = (ref = pb.sms.phone_target) != null ? ref.phone : void 0;
    if (!phone_number) {
      phone_number = pb.sms.new_sms_picker.search;
    }
    input = onecup.lookup("#sms-message");
    if (input.value === "") {
      return;
    }
    guid = pb.rand_iden();
    pb.api.texts.send(pb.sms.target.obj, [phone_number], input.value, guid);
    return input.value = "";
  };

  pb.sms.send_file = function(file) {
    var device, img, reader, thread;
    device = pb.sms.target.obj;
    thread = pb.api.sms.current_thread;
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      return;
    }
    if (!device.has_mms) {
      return;
    }
    img = new Image();
    img.onload = function() {
      var addresses, array, blob, byteString, c, canvas, ctx, dataUrl, guid, height, i, j, len, mimeString, push, r, width;
      canvas = document.createElement('canvas');
      ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      height = img.height;
      width = img.width;
      if (width > height) {
        if (width > 1536) {
          height *= 1536 / width;
          width = 1536;
        }
      } else {
        if (height > 1536) {
          width *= 1536 / height;
          height = 1536;
        }
      }
      canvas.width = width;
      canvas.height = height;
      ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      dataUrl = canvas.toDataURL(file.type);
      mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
      if (dataUrl.split(',')[0].indexOf('base64') >= 0) {
        byteString = atob(dataUrl.split(',')[1]);
      } else {
        byteString = unescape(dataUrl.split(',')[1]);
      }
      array = new Uint8Array(byteString.length);
      for (i = j = 0, len = byteString.length; j < len; i = ++j) {
        c = byteString[i];
        array[i] = byteString.charCodeAt(i);
      }
      blob = new Blob([array], {
        type: mimeString
      });
      addresses = (function() {
        var k, len1, ref, results;
        ref = thread.recipients;
        results = [];
        for (k = 0, len1 = ref.length; k < len1; k++) {
          r = ref[k];
          results.push(r.address);
        }
        return results;
      })();
      guid = pb.rand_iden();
      push = {
        addresses: addresses,
        ghost: true,
        timestamp: Date.now() / 1000,
        direction: "outgoing",
        uploading: true,
        data_url: dataUrl,
        guid: guid,
        thread_id: thread.id
      };
      pb.sms.q.push(push);
      return pb.api.pushes.upload_file(blob, function(r) {
        return pb.api.texts.send(device, addresses, "", guid, push.thread_id, r.file_type, r.file_url);
      });
    };
    reader = new FileReader();
    reader.onload = function(e) {
      return img.src = e.target.result;
    };
    return reader.readAsDataURL(file);
  };

  views.sms_side_bar = function() {
    var j, len, ref, results, thread;
    div(function() {
      width("100%");
      return height(10);
    });
    div(function() {
      min_width(400);
      return pb.sms.picker.draw(pb.sidebar.sms.targets);
    });
    if (!pb.sms.target) {
      return;
    }
    if (pb.sms.target.obj.app_version === void 0 || pb.sms.target.obj.app_version < 256) {
      return;
    }
    div(function() {
      width("100%");
      return height(8);
    });
    new_sms();
    div(function() {
      width("100%");
      return height(8);
    });
    if (pb.api.sms.threads) {
      ref = pb.api.sms.threads;
      results = [];
      for (j = 0, len = ref.length; j < len; j++) {
        thread = ref[j];
        results.push(draw_thread(thread));
      }
      return results;
    }
  };

  new_sms = function() {
    return div(".target.pointer", function() {
      height(56);
      position("relative");
      if (pb.sidebar.sub_tab === "new") {
        background_color("white");
      }
      onclick(function() {
        return goto("#sms/" + pb.sms.target.obj.iden + "/new");
      });
      icon(".pushfont-circle", function() {
        position("absolute");
        top(15);
        left(9);
        font_size(49);
        return color(colors.gray4);
      });
      return div(function() {
        css_text_overflow();
        position("absolute");
        top(14);
        left(12 + 32 + 12);
        right(0);
        color(colors.gray3);
        return text("Send new message");
      });
    });
  };

  thread_names = function(thread) {
    var names, r;
    names = (function() {
      var j, len, ref, results;
      ref = thread.recipients;
      results = [];
      for (j = 0, len = ref.length; j < len; j++) {
        r = ref[j];
        results.push(r.name);
      }
      return results;
    })();
    return names.join(", ");
  };

  push_name = function(push) {
    var recipient, thread;
    if (push.direction !== "incoming") {
      return pb.account.name;
    } else {
      thread = pb.api.sms.current_thread;
      if (thread.recipients.length === 1) {
        return thread_names(thread);
      }
      recipient = thread.recipients[push.recipient_index];
      if (recipient) {
        return recipient.name;
      } else {
        return "";
      }
    }
  };

  thread_image = function(thread) {
    if (thread.recipients.length > 1) {
      return pb.api.sms.default_group_image_url;
    }
    return recipient_image(thread.recipients[0]);
  };

  recipient_image = function(recipient) {
    if (recipient != null ? recipient.thumbnail : void 0) {
      return "data:image/jpeg;base64," + recipient.thumbnail;
    }
    if (recipient != null ? recipient.image_url : void 0) {
      return recipient.image_url;
    }
    return pb.api.sms.default_image_url;
  };

  push_image = function(push) {
    var recipient, thread;
    if (push.direction !== "incoming") {
      if (pb.account.image_url) {
        return pb.account.image_url;
      }
    } else {
      thread = pb.api.sms.current_thread;
      if (thread.recipients.length === 1) {
        return thread_image(thread);
      }
      recipient = thread.recipients[push.recipient_index];
      return recipient_image(recipient);
    }
  };

  draw_thread = function(thread) {
    div(".pointer", function() {
      var blurb, names, ref, ref1;
      height(60);
      position("relative");
      onclick(function() {
        track("sm_thread_select");
        return goto("#sms/" + pb.sms.target.obj.iden + "/" + thread.id);
      });
      ondblclick(function() {
        return console.log(thread);
      });
      if (pb.sidebar.sub_tab !== "new") {
        if (((ref = pb.api.sms.current_thread) != null ? ref.id : void 0) === thread.id) {
          background("white");
        }
      }
      names = thread_names(thread);
      raw_img({
        src: thread_image(thread),
        title: names
      }, function() {
        position("absolute");
        top(10);
        left(12);
        width(32);
        height(32);
        return border_radius(16);
      });
      if (pb.pushbox.width_sidebar > 100) {
        blurb = (ref1 = thread.latest) != null ? ref1.body : void 0;
        div(function() {
          position("absolute");
          top(4);
          left(12 + 32 + 12);
          right(0);
          font_size(18);
          color(colors.gray3);
          css_text_overflow();
          return text(names);
        });
        return div(function() {
          position("absolute");
          top(30);
          left(12 + 32 + 12);
          right(0);
          font_size(12);
          color(colors.gray2);
          css_text_overflow();
          return text(blurb);
        });
      }
    });
  };

  sms_needs_e2e = function() {
    return div(function() {
      position("absolute");
      top(0);
      bottom(0);
      left(0);
      right(0);
      background(colors.gray1);
      return div(function() {
        position("absolute");
        top("50%");
        transform("translateY(-50%)");
        width("100%");
        return div(function() {
          position("relative");
          width(300);
          padding(20);
          border_radius(10);
          img({
            src: "/img/encryption/lock.png",
            "with": 144,
            height: 144
          }, function() {
            position("absolute");
            top(-120);
            left("50%");
            return transform("translateX(-50%)");
          });
          background("white");
          margin("0 auto");
          text_align("center");
          div(function() {
            margin_top(10);
            font_size(22);
            return text("Your data is encrypted");
          });
          div(function() {
            margin_top(5);
            return text("Please enter your password:");
          });
          return div(function() {
            margin_top(10);
            padding("0px 20px");
            input({
              type: "password",
              placeholder: "Encryption Password"
            });
            return onkeypress(function(e) {
              if (e.which === 13) {
                pb.e2e.set_password(e.target.value);
                return pb.api.sms.tickle();
              }
            });
          });
        });
      });
    });
  };

  android_app_needs_upgrade = function() {
    return div(function() {
      position("absolute");
      top(0);
      bottom(0);
      left(0);
      right(0);
      background(colors.gray1);
      return div(function() {
        position("absolute");
        top("50%");
        transform("translateY(-50%)");
        width("100%");
        return div(function() {
          position("relative");
          width(400);
          padding(20);
          border_radius(10);
          img({
            src: "/img/sms/updatePhone.png",
            "with": 144,
            height: 144
          }, function() {
            position("absolute");
            top(-120);
            left("50%");
            return transform("translateX(-50%)");
          });
          background("white");
          margin("0 auto");
          text_align("center");
          div(function() {
            margin_top(10);
            font_size(22);
            return text("To continue texting, please update the Pushbullet app on your phone.");
          });
          return div(function() {
            margin_top(5);
            return text("(Sorry for the inconvenience!)");
          });
        });
      });
    });
  };

  views.sms = function() {
    var banner, ref;
    if (pb.e2e.error) {
      sms_needs_e2e();
      return;
    }
    if (!pb.api.sms.current_thread || !((ref = pb.sms.target) != null ? ref.obj : void 0)) {
      return;
    }
    if (pb.sms.target.obj.app_version === void 0 || pb.sms.target.obj.app_version < 256) {
      android_app_needs_upgrade();
      return;
    }
    div("#pushlist", function() {
      position("absolute");
      top(0);
      bottom(300);
      left(0);
      right(0);
      overflow_y("auto");
      overflow_x("hidden");
      display("table-cell");
      vertical_align("bottom");
      background("white");
      return div("#innerlist", function() {
        position("relative");
        return draw_sms_pushes();
      });
    });
    div("#pushform", function() {
      z_index("6");
      position("absolute");
      bottom(0);
      left(0);
      right(0);
      height(80);
      background(colors.gray1);
      return views.sms_form();
    });
    if (!pb.account.pro) {
      if (pb.account.reply_count_quota === "near_limit") {
        banner = {
          type: "warning",
          text: "You're getting close to the free message limit for this month."
        };
      }
      if (pb.account.reply_count_quota === "over_limit") {
        banner = {
          type: "limit",
          text: "You've reached the free message limit for this month."
        };
      }
    }
    if (banner) {
      return div("#sms-banner", function() {
        position("absolute");
        top(0);
        left(0);
        right(0);
        padding("5px 10px");
        text_align("center");
        if (banner.type === "limit") {
          background(colors.red);
          color("white");
        } else {
          background(colors.gray1);
          color(colors.gray3);
        }
        div(function() {
          return text(banner.text);
        });
        return div(function() {
          return a({
            href: "/pro",
            target: "_blank"
          }, function() {
            onclick(function() {
              return track("go_upgrade", {
                source: "sms_" + banner.type
              });
            });
            return text("Upgrade to Pushbullet Pro to send unlimited messages.");
          });
        });
      });
    }
  };

  draw_sms_pushes = function() {
    var error, i, j, k, l, len, len1, len2, len3, m, max_timestamp, prev_push, push, ref, ref1, results, sent_guids, sms, sms_pushes, status, text, texts;
    if (pb.api.sms.thread === null) {
      return;
    }
    sent_guids = {};
    max_timestamp = 0;
    sms_pushes = [];
    if (pb.api.sms.thread) {
      ref = pb.api.sms.thread;
      for (j = 0, len = ref.length; j < len; j++) {
        sms = ref[j];
        sms_pushes.unshift(sms);
        if (max_timestamp < sms.timestamp) {
          max_timestamp = sms.timestamp;
        }
        sent_guids[sms.guid] = true;
      }
    }
    texts = pb.api.texts.all.sort(function(a, b) {
      return a.created - b.created;
    });
    for (k = 0, len1 = texts.length; k < len1; k++) {
      text = texts[k];
      if (text.data.encrypted) {
        if (pb.e2e.enabled) {
          try {
            text.data = JSON.parse(pb.e2e.decrypt(text.data.ciphertext));
          } catch (error) {
            continue;
          }
        } else {
          continue;
        }
      }
      status = text.data.status || "queued";
      if (text.data.timestamp < max_timestamp) {
        continue;
      }
      if (!belongs_in_thread(text)) {
        continue;
      }
      sent_guids[text.data.guid] = true;
      push = {
        iden: text.iden,
        body: text.data.message,
        addresses: text.data.addresses,
        timestamp: text.data.timestamp || text.created,
        direction: "outgoing",
        status: status,
        ghost: status === "queued" && !text.data.timestamp,
        error: false
      };
      if (text.file_url) {
        push.image_urls = [text.file_url];
      }
      sms_pushes.push(push);
    }
    pb.sms.q = (function() {
      var l, len2, ref1, results;
      ref1 = pb.sms.q;
      results = [];
      for (l = 0, len2 = ref1.length; l < len2; l++) {
        sms = ref1[l];
        if (!sent_guids[sms.guid]) {
          results.push(sms);
        }
      }
      return results;
    })();
    ref1 = pb.sms.q;
    for (l = 0, len2 = ref1.length; l < len2; l++) {
      sms = ref1[l];
      if (sms.thread_id !== pb.api.sms.current_thread.id) {
        continue;
      }
      sms_pushes.push(sms);
    }
    prev_push = null;
    results = [];
    for (i = m = 0, len3 = sms_pushes.length; m < len3; i = ++m) {
      push = sms_pushes[i];
      results.push(div(".pushwrap", function() {
        width("100%");
        position("absolute");
        bottom(0);
        return draw_sms_push(push, sms_pushes[i - 1], sms_pushes[i + 1]);
      }));
    }
    return results;
  };

  belongs_in_thread = function(text) {
    var j, len, recipient, ref, thread;
    if (pb.sms.target.obj.iden !== text.data.target_device_iden) {
      return false;
    }
    thread = pb.api.sms.current_thread;
    if (thread.recipients.length !== text.data.addresses.length) {
      return false;
    }
    ref = thread.recipients;
    for (j = 0, len = ref.length; j < len; j++) {
      recipient = ref[j];
      if (text.data.addresses.indexOf(recipient.address) === -1) {
        return false;
      }
    }
    return true;
  };

  draw_sms_push = function(push, prev_push, next_push) {
    var bubble_width, direction, time, time_bar, time_str;
    if (!prev_push || Math.abs(prev_push.timestamp - push.timestamp) > 60 * 15) {
      time = new moment(push.timestamp * 1000);
      time_bar = time.calendar();
      div(function() {
        margin("10px 0px");
        text_align("center");
        font_size(14);
        color(colors.gray2);
        return text(time_bar);
      });
    }
    bubble_width = pb.pushbox.width_mainbar - 100;
    if (bubble_width > 500) {
      bubble_width = 500;
    }
    time_str = false;
    if (push.direction === "incoming") {
      direction = "left";
    } else {
      direction = "right";
    }
    div(".pushbubble", function() {
      ondblclick(function() {
        return console.log(push);
      });
      overflow("hidden");
      return div(function() {
        var bg_color, needs_chunk, timestamp;
        position("relative");
        width(bubble_width);
        min_height(32);
        margin_top(2);
        margin_left(10);
        margin_right(10);
        margin_bottom(2);
        font_size(15);
        line_height(18);
        float(direction);
        if (!next_push) {
          timestamp = push.timestamp * 1000;
          if (timestamp > Date.now() - 60 * 5000) {
            if (direction === "right") {
              time_str = "Now";
            }
          } else {
            time = new moment(push.timestamp * 1000);
            time_str = time.fromNow();
          }
        } else {
          time_str = false;
        }
        if (push.ghost) {
          if (!next_push) {
            time_str = "Pending";
            console.log("ghost", push);
            timestamp = push.timestamp * 1000;
            if (timestamp < Date.now() - 30 * 1000) {
              time_str = "Pending - <a href='https://help.pushbullet.com/articles/why-are-my-text-messages-stuck-pending/' target='_blank'>Stuck pending?</a>";
            }
          }
          opacity(".5");
        }
        if (Math.abs((next_push != null ? next_push.timestamp : void 0) - push.timestamp) > 60 * 15) {
          needs_chunk = true;
        } else if (push.recipient_index !== (next_push != null ? next_push.recipient_index : void 0)) {
          needs_chunk = true;
        } else {
          needs_chunk = push.direction !== (next_push != null ? next_push.direction : void 0);
        }
        if (needs_chunk || time_str) {
          margin_bottom(10);
          raw_img({
            src: push_image(push),
            title: push_name(push)
          }, function() {
            position("absolute");
            if (direction === "right") {
              right(0);
            } else {
              left(0);
            }
            bottom(0);
            width(40);
            height(40);
            return border_radius(20);
          });
          if (direction === "right") {
            if (push.status === "failed") {
              bg_color = colors.error;
            } else {
              bg_color = colors.me;
            }
            div(function() {
              position("absolute");
              bottom(0);
              right(40);
              width(0);
              height(0);
              border_style("solid");
              border_width("10px 0 0 15px");
              return border_color("transparent transparent transparent " + bg_color);
            });
          } else {
            div(function() {
              position("absolute");
              bottom(0);
              left(38);
              width(0);
              height(0);
              border_style("solid");
              border_width("0 0 10px 15px");
              return border_color("transparent transparent " + colors.other_sms + " transparent");
            });
          }
        }
        return div(".text-part", function() {
          var image_url, j, len, ref, text_color;
          display("block");
          position("relative");
          max_width("100%");
          word_wrap("break-word");
          white_space("pre-wrap");
          border_radius(4);
          min_height(37);
          min_width(20);
          if (direction === "right") {
            margin_right(50);
            background_color(colors.me);
            text_color = color.gray4;
          } else {
            background_color(colors.other_sms);
            text_color = "white";
            margin_left(50);
          }
          float(direction);
          color(text_color);
          if (push.body) {
            div(function() {
              margin(10);
              return raw(linkify.linkify(push.body));
            });
          }
          if (push.image_urls) {
            ref = push.image_urls;
            for (j = 0, len = ref.length; j < len; j++) {
              image_url = ref[j];
              draw_push_image(push, image_url, bubble_width);
            }
          }
          if (push.status === "failed") {
            background_color(colors.error);
          }
          if (push.iden) {
            div(".x.pointer", function() {
              position("absolute");
              top(0);
              if (direction === "right") {
                left(-25);
              } else {
                right(-25);
              }
              color(colors.gray4);
              icon(".pushfont-close");
              return onclick(function() {
                return pb.api.texts["delete"](push);
              });
            });
          }
          if (push.data_url) {
            return draw_push_image(push, push.data_url, bubble_width);
          }
        });
      });
    });
    if (time_str && !push.progress) {
      return div(function() {
        if (direction === "right") {
          text_align("right");
        }
        padding_left(60);
        padding_right(60);
        padding_bottom(10);
        font_size(14);
        opacity(".7");
        return raw(time_str);
      });
    }
  };

  draw_push_image = function(push, image_url, bubble_width) {
    var exact_size, w;
    exact_size = false;
    w = Math.min(bubble_width - 20, 300);
    return onecup.raw_img("#image-" + push.iden, {
      src: image_url
    }, function() {
      margin(10);
      cursor("pointer");
      if (exact_size) {
        width(w);
        height(h);
      } else {
        max_width(w);
      }
      onload(function() {
        return onecup.refresh();
      });
      return onclick(function() {
        return window.open(image_url);
      });
    });
  };

  views.sms_form = function() {
    var text_height;
    pb.sms.form_showing = true;
    if (pb.api.sms.current_thread.recipients.length > 1 && !pb.sms.target.obj.has_mms) {
      return;
    }
    div(".divider", function() {
      height("1px");
      width("100%");
      return background(colors.white2);
    });
    text_height = 80 - 1;
    textarea("#message", {
      type: "text",
      placeholder: "Type a text message"
    }, function() {
      height(text_height);
      position("absolute");
      top(1);
      left(0);
      padding_top(14);
      padding_left(14);
      width("90%");
      float("left");
      border("none");
      overflow_y("auto");
      onkeyup(function(e) {
        return pb.sms.count = e.target.value.length;
      });
      return onkeydown(function(e) {
        if (e.which === 13 && !e.shiftKey) {
          pb.sms.send(e.target.value);
          e.target.value = "";
          e.preventDefault();
        } else {
          onecup.no_refresh();
        }
      });
    });
    return div("#send-button.pointer", function() {
      position("absolute");
      top(1);
      right(0);
      width("10%");
      font_size(40);
      background_color("white");
      text_align("center");
      height(text_height);
      line_height(text_height);
      if (pb.sms.count === 0) {
        icon(".pushfont-paperclip");
        return input({
          type: "file",
          multiple: true
        }, function() {
          position("absolute");
          top(0);
          right(0);
          background("red");
          width("100%");
          height("100%");
          opacity("0.000001");
          return onchange(function(e) {
            var file, j, len, ref, results;
            if (e.target.files) {
              ref = e.target.files;
              results = [];
              for (j = 0, len = ref.length; j < len; j++) {
                file = ref[j];
                results.push(pb.sms.send_file(file));
              }
              return results;
            }
          });
        });
      } else {
        icon(".pushfont-send");
        return onclick(function() {
          var message;
          message = onecup.lookup("#message");
          pb.sms.send(message.value);
          message.value = "";
          return pb.sms.count = 0;
        });
      }
    });
  };

  pb.sms.new_sms_picker = new Picker({
    direction: "bottom",
    placeholder: "Pick a phone number",
    phone_suggest: true,
    cb: function(target) {
      var ref;
      pb.sms.phone_target = target;
      return (ref = lookup("#sms-message")) != null ? ref.focus() : void 0;
    }
  });

  views.new_sms = function() {
    var contact, j, len, phone_targets, phonebook, ref, ref1, ref2, use_device;
    if (pb.e2e.error) {
      sms_needs_e2e();
      return;
    }
    phone_targets = [];
    if (((ref = pb.sms.target) != null ? (ref1 = ref.obj) != null ? ref1.has_sms : void 0 : void 0) === true) {
      use_device = pb.sms.target.obj;
      phonebook = pb.api.sms.get_phonebook(use_device);
      if (phonebook.contacts != null) {
        ref2 = phonebook.contacts;
        for (j = 0, len = ref2.length; j < len; j++) {
          contact = ref2[j];
          phone_targets.push({
            type: "phone",
            name: contact.name,
            phone: contact.phone,
            image_url: "/img/deviceicons/" + contact.phone_type + ".png",
            info: {
              blurb: contact.phone
            }
          });
        }
      }
    }
    return div(function() {
      position("relative");
      width(500);
      margin("200px auto");
      div(function() {
        border("1px solid " + colors.gray2);
        margin_bottom(-1);
        return pb.sms.new_sms_picker.draw(phone_targets);
      });
      textarea("#sms-message", {
        placeholder: "Type a message, press enter to send"
      }, function() {
        border("1px solid " + colors.gray2);
        height(140);
        padding("8px 12px");
        onkeyup(function(e) {
          return pb.sms.count = e.target.value.length;
        });
        onkeydown(function(e) {
          pb.sms.count = e.target.value.length;
          if (e.which === 13 && !e.ctrlKey && !e.shiftKey) {
            pb.sms.send_new();
            return e.preventDefault();
          }
        });
        return onkeypress(function(e) {
          return pb.sms.count = e.target.value.length;
        });
      });
      div("#count", function() {
        position("absolute");
        left(0);
        bottom(-28);
        font_weight("bold");
        font_size(14);
        if (pb.sms.count > 140) {
          color(colors.red);
        }
        text(pb.sms.count);
        text("/140");
        if (pb.sms.count > 140) {
          return text(" - Warning, longer texts may not send");
        }
      });
      div("#warning", function() {
        position("absolute");
        left(0);
        bottom(-50);
        font_size(12);
        color(colors.gray2);
        return text("Note: Your phone must be powered on and have an internet connection for the texts to send.");
      });
      return div("#send-button.pointer", function() {
        position("absolute");
        right(10);
        bottom(15);
        font_size(40);
        onclick(function() {
          return pb.sms.send_new();
        });
        return icon(".pushfont-send");
      });
    });
  };

}).call(this);

// from 'src/views/remotefiles.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var contains, draw_downloading_file, draw_file_popup, draw_grid_file, draw_list_file, draw_remote_device, item_action, item_size, item_thumb, sms_needs_e2e;

  eval(onecup["import"]());

  pb.remotefiles = {};

  pb.remotefiles.view = "grid";

  pb.remotefiles.device_started = false;

  pb.remotefiles.popup = null;

  views.remotefiles_sidebar = function() {
    var d, device, devices, i, j, len, len1, ref;
    if (pb.path[1] != null) {
      ref = pb.api.devices.all;
      for (i = 0, len = ref.length; i < len; i++) {
        device = ref[i];
        if (device.iden === pb.path[1]) {
          pb.api.remotefiles.device = device;
          if (!pb.remotefiles.device_started) {
            pb.remotefiles.device_started = true;
            pb.api.remotefiles.directory_request("~");
          }
        }
      }
    }
    div(function() {
      height(32);
      return width("100%");
    });
    devices = (function() {
      var j, len1, ref1, results;
      ref1 = pb.api.devices.all;
      results = [];
      for (j = 0, len1 = ref1.length; j < len1; j++) {
        d = ref1[j];
        if (d.remote_files != null) {
          results.push(d);
        }
      }
      return results;
    })();
    for (j = 0, len1 = devices.length; j < len1; j++) {
      device = devices[j];
      draw_remote_device(device);
    }
    if (devices.length === 0) {
      return div(function() {
        padding(10);
        color(colors.gray2);
        return text("No devices with Remote Files enabled.");
      });
    }
  };

  draw_remote_device = function(device) {
    var state;
    if (device.remote_files == null) {
      state = "Not Supported";
    }
    if (device.remote_files === "disabled") {
      state = "Disabled";
    } else if (device.remote_files === "enabled") {
      if (!pb.api.pinger.online[device.iden]) {
        state = "Not Connected";
      } else {
        state = "Enabled";
      }
    }
    return div(".target.pointer", function() {
      var ref;
      height(60);
      position("relative");
      if (state !== "Enabled") {
        opacity(".5");
      }
      if (((ref = pb.api.remotefiles.device) != null ? ref.iden : void 0) === device.iden) {
        background("white");
      }
      onclick(function() {
        track("remotefiles_device", {
          type: device.type
        });
        goto("/#remotefiles/" + device.iden);
        pb.api.remotefiles.device = device;
        return pb.api.remotefiles.directory_request("~");
      });
      ondblclick(function() {
        return console.log(device);
      });
      raw_img({
        src: pb.api.devices.guess_icon(device)
      }, function() {
        position("absolute");
        top(10);
        left(12);
        width(32);
        height(32);
        return border_radius(16);
      });
      if (pb.pushbox.width_sidebar > 100) {
        div(function() {
          position("absolute");
          top(4);
          left(12 + 32 + 12);
          right(0);
          font_size(18);
          color(colors.gray3);
          css_text_overflow();
          return text(device.nickname);
        });
        return div(function() {
          position("absolute");
          top(30);
          left(12 + 32 + 12);
          right(0);
          font_size(12);
          color(colors.gray2);
          css_text_overflow();
          return text(state);
        });
      }
    });
  };

  views.remotefiles_view = function() {
    if (pb.e2e.error) {
      sms_needs_e2e(function() {
        return pb.api.remotefiles.directory_request("~");
      });
      return;
    }
    div("#file-area", function() {
      position("absolute");
      top(0);
      if (pb.api.remotefiles.file_q.length > 0) {
        bottom(64 + 64);
      } else {
        bottom(0);
      }
      left(0);
      right(0);
      overflow_y("auto");
      overflow_x("hidden");
      if (!pb.api.remotefiles.device) {
        div(function() {
          font_size(18);
          width(300);
          margin("140px auto");
          text_align("center");
          return text("Select a device");
        });
        return;
      }
      div("#remote-files-header", function() {
        height(64);
        if (pb.api.remotefiles.parent_path != null) {
          img(".hover-fade", {
            src: "/img/remotefiles/up.png",
            width: 32,
            height: 32
          }, function() {
            position("absolute");
            top(16);
            left(16);
            return onclick(function() {
              var parent_path;
              parent_path = pb.api.remotefiles.parent_path;
              if (parent_path != null) {
                return pb.api.remotefiles.directory_request(parent_path);
              }
            });
          });
        }
        img(".hover-fade", {
          src: "/img/remotefiles/list.png",
          width: 32,
          height: 32
        }, function() {
          position("absolute");
          top(16);
          right(48);
          return onclick(function() {
            return pb.remotefiles.view = "list";
          });
        });
        img(".hover-fade", {
          src: "/img/remotefiles/grid.png",
          width: 32,
          height: 32
        }, function() {
          position("absolute");
          top(16);
          right(8);
          return onclick(function() {
            return pb.remotefiles.view = "grid";
          });
        });
        return div(function() {
          position("absolute");
          top(20);
          left(64);
          right(80);
          font_size(20);
          overflow("hidden");
          if (pb.api.remotefiles.path === "~") {
            return text("Home");
          } else {
            return text(pb.api.remotefiles.path);
          }
        });
      });
      if (pb.api.remotefiles.loading) {
        div(function() {
          font_size(40);
          width(100);
          margin("140px auto");
          text_align("center");
          return icon(".icon-spinner.icon-spin.icon-large");
        });
      } else {
        div("#remotefiles-" + pb.remotefiles.view, function() {
          var i, item, len, ref, results;
          padding(20);
          width("100%");
          ref = pb.api.remotefiles.contents;
          results = [];
          for (i = 0, len = ref.length; i < len; i++) {
            item = ref[i];
            if (pb.remotefiles.view === "list") {
              results.push(draw_list_file(item));
            } else if (pb.remotefiles.view === "grid") {
              results.push(draw_grid_file(item));
            } else {
              results.push(void 0);
            }
          }
          return results;
        });
        if (pb.api.remotefiles.contents.length === 0) {
          div(function() {
            padding_top(100);
            text_align("center");
            color(colors.gray2);
            return text("No files");
          });
        }
      }
      if (pb.remotefiles.popup) {
        return draw_file_popup();
      }
    });
    if (pb.api.remotefiles.file_q.length > 0) {
      return div("#file-queue", function() {
        var file, i, len, ref, results;
        z_index("6");
        position("absolute");
        bottom(0);
        left(0);
        right(0);
        height(64 + 64 + 1);
        border_top("1px solid " + colors.gray1);
        overflow_y("auto");
        overflow_x("hidden");
        ref = pb.api.remotefiles.file_q;
        results = [];
        for (i = 0, len = ref.length; i < len; i++) {
          file = ref[i];
          results.push(draw_downloading_file(file));
        }
        return results;
      });
    }
  };

  draw_file_popup = function() {
    return div(function() {
      position("absolute");
      top(200);
      left(30);
      right(30);
      height(200);
      background_color("white");
      box_shadow("0 0 4px rgba(0,0,0,.14),0 4px 8px rgba(0,0,0,.28)");
      padding(20);
      h2(function() {
        return text("Request " + pb.remotefiles.popup.file.name);
      });
      return div(function() {
        position("absolute");
        bottom(20);
        right(20);
        button(function() {
          text("Request");
          return onclick(function() {
            pb.api.remotefiles.file_request(pb.remotefiles.popup.file);
            pb.remotefiles.popup.state = "waiting";
            return pb.remotefiles.popup = null;
          });
        });
        text(" ");
        return button(function() {
          text("Cancel");
          return onclick(function() {
            return pb.remotefiles.popup = null;
          });
        });
      });
    });
  };

  contains = function(a, b) {
    return a.indexOf(b) !== -1;
  };

  item_thumb = function(item) {
    var thumb_url, url;
    thumb_url = "/img/remotefiles/file.png";
    if (item.is_drive) {
      thumb_url = "/img/remotefiles/drive.png";
    } else if (item.is_directory) {
      thumb_url = "/img/remotefiles/folder.png";
    } else if (contains(item.mime_type, "image")) {
      thumb_url = "/img/remotefiles/picture.png";
    } else if (contains(item.mime_type, "pdf")) {
      thumb_url = "/img/remotefiles/pdf.png";
    } else if (contains(item.mime_type, "text")) {
      thumb_url = "/img/remotefiles/text.png";
    } else if (contains(item.mime_type, "audio")) {
      thumb_url = "/img/remotefiles/music.png";
    } else if (contains(item.mime_type, "video")) {
      thumb_url = "/img/remotefiles/video.png";
    }
    if (item.mime_type === "image\/png" || item.mime_type === "image\/jpeg") {
      url = pb.api.remotefiles.load_thumbnail(item.path);
      if (url && url !== "loading") {
        thumb_url = url;
      }
    }
    return thumb_url;
  };

  item_action = function(item) {
    if (item.is_directory) {
      track("remotefiles_directory");
      return pb.api.remotefiles.directory_request(item.path);
    } else {
      track("remotefiles_popup");
      return pb.remotefiles.popup = {
        state: "request",
        file: item
      };
    }
  };

  item_size = function(item) {
    var f;
    f = function(n) {
      return n.toFixed(1);
    };
    if (item.size < 1024) {
      return item.size + 'b';
    } else if (item.size < 1024 * 1024) {
      return f(item.size / 1024) + 'K';
    } else if (item.size < 1024 * 1024 * 1024) {
      return f(item.size / 1024 / 1024) + 'M';
    } else if (item.size < 1024 * 1024 * 1024 * 1024) {
      return f(item.size / 1024 / 1024 / 1024) + 'G';
    } else if (item.size < 1024 * 1024 * 1024 * 1024 * 1024) {
      return f(item.size / 1024 / 1024 / 1024 / 1024) + 'T';
    }
  };

  draw_list_file = function(item) {
    return div(".hover-lightgray", function() {
      position("relative");
      height(48);
      margin_bottom(8);
      border_radius(5);
      onclick(function() {
        return item_action(item);
      });
      div(function() {
        position("absolute");
        left(0);
        top(0);
        width(64 + 16);
        return img({
          src: item_thumb(item),
          width: 48,
          height: 48
        });
      });
      div(function() {
        position("absolute");
        left(48 + 8);
        right(60);
        top(0);
        line_height(48);
        return text(item.name);
      });
      return div(function() {
        position("absolute");
        width(60);
        right(0);
        top(0);
        line_height(48);
        color(colors.gray2);
        text_align("right");
        return text(item_size(item));
      });
    });
  };

  draw_grid_file = function(item) {
    return div(".hover-lightgray", function() {
      position("relative");
      height(64 + 64);
      width(64 + 64);
      float("left");
      overflow("hidden");
      onclick(function() {
        return item_action(item);
      });
      img({
        src: item_thumb(item),
        width: 64,
        height: 64
      }, function() {
        position("absolute");
        left(32);
        return top(16);
      });
      return div(function() {
        position("absolute");
        left(8);
        right(8);
        overflow("hidden");
        top(64 + 8 + 16);
        line_height(20);
        font_size(14);
        text_align("center");
        return text(item.name);
      });
    });
  };

  draw_downloading_file = function(file) {
    return div(".hover-lightgray", function() {
      position("relative");
      height(64 + 64);
      width(64 + 64);
      float("left");
      overflow("hidden");
      if (!file.done) {
        opacity(".5");
      }
      onclick(function() {
        if (file.done) {
          window.open(file.push.file_url);
          return track("remotefiles_download");
        }
      });
      if (file.confirmed) {
        img({
          src: item_thumb(file.item),
          width: 64,
          height: 64
        }, function() {
          position("absolute");
          left(32);
          return top(16);
        });
      } else {
        div(function() {
          position("absolute");
          left(46);
          top(34);
          font_size(30);
          text_align("center");
          return icon(".icon-spinner.icon-spin.icon-large");
        });
      }
      return div(function() {
        position("absolute");
        left(8);
        right(8);
        overflow("hidden");
        top(64 + 8 + 16);
        line_height(20);
        font_size(14);
        text_align("center");
        if (file.done) {
          return text(file.item.name);
        } else if (file.confirmed) {
          return text("uploading...");
        } else {
          return text("wating on device...");
        }
      });
    });
  };

  sms_needs_e2e = function(cb) {
    return div(function() {
      position("absolute");
      top(0);
      bottom(0);
      left(0);
      right(0);
      background(colors.gray1);
      return div(function() {
        position("absolute");
        top("50%");
        transform("translateY(-50%)");
        width("100%");
        return div(function() {
          position("relative");
          width(300);
          padding(20);
          border_radius(10);
          img({
            src: "/img/encryption/lock.png",
            "with": 144,
            height: 144
          }, function() {
            position("absolute");
            top(-120);
            left("50%");
            return transform("translateX(-50%)");
          });
          background("white");
          margin("0 auto");
          text_align("center");
          div(function() {
            margin_top(10);
            font_size(22);
            return text("Your data is encrypted");
          });
          div(function() {
            margin_top(5);
            return text("Please enter your password:");
          });
          return div(function() {
            margin_top(10);
            padding("0px 20px");
            input({
              type: "password",
              placeholder: "Encryption Password"
            });
            return onkeypress(function(e) {
              if (e.which === 13) {
                pb.e2e.set_password(e.target.value);
                return cb();
              }
            });
          });
        });
      });
    });
  };

}).call(this);

// from 'src/views/sidebar.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var add_target, draw_unread_count, k, me_target, mintab_count, sidebar, v;

  eval(onecup["import"]());

  pb.sidebar = {
    target: null,
    tab: null,
    sub_tab: "Account",
    expanded: null
  };

  sidebar = pb.db.get("sidebar");

  if (sidebar) {
    for (k in sidebar) {
      v = sidebar[k];
      pb.sidebar[k] = v;
    }
  }

  pb.sidebar.tabs = [];

  pb.sidebar.setup = {
    name: "setup",
    display_name: "Setup",
    url: "/#setup",
    compute_count: function() {
      var count;
      count = pb.setup.all_steps() - pb.setup.step_number();
      if (count < 0) {
        count = 0;
      }
      return count;
    },
    dont_show: function() {
      return !pb.setup.should_show();
    }
  };

  pb.sidebar.people = {
    name: "people",
    display_name: "People",
    url: "/#people",
    targets: []
  };

  pb.sidebar.devices = {
    name: "devices",
    display_name: "Devices",
    url: "/#devices",
    targets: []
  };

  pb.sidebar.following = {
    name: "following",
    display_name: "Following",
    url: "/#following",
    targets: []
  };

  pb.sidebar.sms = {
    name: "sms",
    display_name: "Texting",
    url: "/#sms",
    targets: [],
    dont_show: function() {
      return pb.sidebar.sms.targets.length === 0;
    }
  };

  pb.sidebar.remotefiles = {
    name: "remotefiles",
    display_name: "Remote Files",
    url: "/#remotefiles",
    targets: []
  };

  pb.sidebar.settings = {
    name: "settings",
    display_name: "Settings",
    url: "/#settings"
  };

  pb.sidebar.needs_update = true;

  pb.sidebar.update = function() {
    return pb.sidebar.needs_update = true;
  };

  pb.sidebar.full_update = function() {
    var d;
    pb.sidebar.needs_update = false;
    pb.sidebar.people.targets = pb.targets.chats();
    pb.sidebar.devices.targets = pb.targets.devices();
    pb.sidebar.following.targets = pb.targets.subscriptions();
    return pb.sidebar.sms.targets = (function() {
      var j, len, ref, results;
      ref = pb.targets.devices();
      results = [];
      for (j = 0, len = ref.length; j < len; j++) {
        d = ref[j];
        d.url = "/#sms/" + d.obj.iden;
        if (!d.obj.has_sms) {
          continue;
        }
        results.push(d);
      }
      return results;
    })();
  };

  pb.sidebar.tabs = [pb.sidebar.setup, pb.sidebar.people, pb.sidebar.devices, pb.sidebar.following, pb.sidebar.sms, pb.sidebar.remotefiles, pb.sidebar.settings];

  pb.sidebar.tab = pb.sidebar.tabs[0];

  css(".minitab:hover", function() {
    return background_color("rgba(0,0,0,.2)");
  });

  views.minitabs = function() {
    var fn, i, j, len, ref, tab;
    if (pb.sidebar.needs_update) {
      pb.sidebar.full_update();
    }
    ref = pb.sidebar.tabs;
    fn = function(tab, i) {
      return div(".minitab.pointer", function() {
        transition("background-color 0.2s ease");
        position("relative");
        display("block");
        width("100%");
        height(64);
        onclick(function() {
          track("mini_tab", {
            type: tab.name
          });
          pb.sidebar.tab = tab;
          return goto(tab.url);
        });
        img({
          src: "/img/tab/" + tab.name + ".png",
          width: 32,
          height: 32
        }, function() {
          position("absolute");
          top(16);
          return left(16);
        });
        div(function() {
          position("absolute");
          top(20);
          left(64);
          right(0);
          font_size(16);
          color("white");
          return text(tab.display_name);
        });
        if (tab.name === pb.sidebar.tab.name) {
          background_color("rgba(0,0,0,.3)");
          div(function() {
            position("absolute");
            z_index("1");
            top(22);
            right(0);
            width(0);
            height(0);
            border_top("9px solid transparent");
            border_right("9px solid " + colors.gray1);
            return border_bottom("9px solid transparent");
          });
        }
        if (tab.compute_count) {
          return draw_unread_count(tab.compute_count());
        } else if (tab.tarets) {
          return draw_unread_count(mintab_count(tab.targets));
        }
      });
    };
    for (i = j = 0, len = ref.length; j < len; i = ++j) {
      tab = ref[i];
      if ((typeof tab.dont_show === "function" ? tab.dont_show() : void 0) === true) {
        continue;
      }
      fn(tab, i);
    }
    return div(".minitab.pointer", function() {
      position("absolute");
      display("block");
      width("100%");
      height(64);
      bottom(0);
      onclick(function() {
        track("sidebar_help");
        return window.open("https://help.pushbullet.com/");
      });
      div(function() {
        position("absolute");
        top(0);
        left(0);
        width(64);
        height(64);
        line_height(64);
        text_align("center");
        font_size(32);
        color("white");
        return text("?");
      });
      return div(function() {
        position("absolute");
        top(20);
        left(64);
        right(0);
        font_size(16);
        color("white");
        return text("Help");
      });
    });
  };

  draw_unread_count = function(count) {
    if (count === 0) {
      return;
    }
    return div(".unread", function() {
      position("absolute");
      top(8);
      left(8);
      color("white");
      width(20);
      height(20);
      line_height(20);
      text_align("center");
      background_color(colors.red);
      border_radius(100);
      if (count > 9) {
        font_size(20);
        return icon(".pushfont-plus");
      } else {
        font_size(14);
        return text(count);
      }
    });
  };

  mintab_count = function(targets) {
    var count, j, len, ref, target;
    count = 0;
    if (targets != null) {
      for (j = 0, len = targets.length; j < len; j++) {
        target = targets[j];
        count += (ref = target.info) != null ? ref.count : void 0;
      }
    }
    return count;
  };

  pb.sidebar.set_minitab = function(name, sub_tab) {
    var j, len, ref, tab;
    if (sub_tab == null) {
      sub_tab = "Account";
    }
    ref = pb.sidebar.tabs;
    for (j = 0, len = ref.length; j < len; j++) {
      tab = ref[j];
      if (tab.name === name) {
        pb.sidebar.tab = tab;
      }
    }
    return pb.sidebar.sub_tab = sub_tab;
  };

  window.views.sidebar = function() {
    return div("#sidebar", function() {
      var j, l, len, len1, len2, m, ref, ref1, ref2, target;
      position("absolute");
      top(0);
      left(0);
      right(0);
      bottom(0);
      overflow_y("auto");
      overflow_x("hidden");
      if (pb.sidebar.tab.name === "settings") {
        return views.account_side_bar();
      } else if (pb.sidebar.tab.name === "setup") {
        return views.setup_sidebar();
      } else if (pb.sidebar.tab.name === "sms") {
        return views.sms_side_bar();
      } else if (pb.sidebar.tab.name === "remotefiles") {
        return views.remotefiles_sidebar();
      } else {
        views.search_area();
        if (pb.search.type === "target" && pb.search.q) {
          return views.search_results();
        } else {
          if (pb.sidebar.tab.name === "people") {
            me_target("/#people/me");
            ref = pb.sidebar.tab.targets;
            for (j = 0, len = ref.length; j < len; j++) {
              target = ref[j];
              views.draw_target(target);
            }
            return add_target("Add a friend", "/#people/new");
          } else if (pb.sidebar.tab.name === "devices") {
            ref1 = pb.sidebar.tab.targets;
            for (l = 0, len1 = ref1.length; l < len1; l++) {
              target = ref1[l];
              views.draw_target(target);
            }
            return add_target("Add a device", "/#devices/new");
          } else if (pb.sidebar.tab.name === "following") {
            ref2 = pb.sidebar.tab.targets;
            for (m = 0, len2 = ref2.length; m < len2; m++) {
              target = ref2[m];
              views.draw_target(target);
            }
            return add_target("Follow something", "/#following/new");
          }
        }
      }
    });
  };

  views.search_area = function() {
    return div(".area", function() {
      position("relative");
      height(50);
      input("#search", {
        type: "text",
        placeholder: "Search"
      }, function() {
        position("absolute");
        top(12);
        left(10);
        width(240);
        bottom(10);
        border("none");
        background("transparent");
        onkeyup(function(e) {
          return pb.search.q = e.target.value;
        });
        return onblur(function(e) {
          return track("sidebar_search", {
            number: e.target.value.length
          });
        });
      });
      return icon(".icon-search", function() {
        position("absolute");
        top(22);
        right(14);
        color(colors.gray2);
        return font_size(16);
      });
    });
  };

  views.search_results = function() {
    return div(".area", function() {
      var j, len, ref, results, target;
      ref = pb.targets.generate();
      results = [];
      for (j = 0, len = ref.length; j < len; j++) {
        target = ref[j];
        if (pb.targets.match(target)) {
          results.push(views.draw_target(target));
        } else {
          results.push(void 0);
        }
      }
      return results;
    });
  };

  me_target = function(url) {
    return div(".target.pointer", function() {
      height(56);
      position("relative");
      if (pb.sidebar.sub_tab === "me") {
        background_color("white");
      }
      onclick(function() {
        track("target_select", {
          type: "me"
        });
        return goto(url);
      });
      raw_img({
        src: pb.account.image_url
      }, function() {
        position("absolute");
        top(10);
        left(12);
        width(32);
        height(32);
        return border_radius(16);
      });
      return div(function() {
        position("absolute");
        top(14);
        left(12 + 32 + 12);
        color(colors.gray3);
        return text("Me");
      });
    });
  };

  add_target = function(message, url) {
    return div(".target.pointer", function() {
      height(56);
      position("relative");
      if (pb.sidebar.sub_tab === "new") {
        background_color("white");
      }
      onclick(function() {
        track("target_new", {
          type: pb.sidebar.tab.name
        });
        return goto(url);
      });
      icon(".pushfont-circle", function() {
        position("absolute");
        top(15);
        left(9);
        font_size(49);
        return color(colors.gray4);
      });
      return div(function() {
        css_text_overflow();
        position("absolute");
        top(14);
        left(12 + 32 + 12);
        right(0);
        color(colors.gray3);
        return text(message);
      });
    });
  };

  pb.sidebar.select = function(obj, force_type, change_url) {
    if (obj) {
      return pb.sidebar.select_target(pb.targets.make(obj, force_type));
    } else {
      return pb.sidebar.select_target(null);
    }
  };

  pb.sidebar.select_target = function(target, tab_url) {
    if (tab_url == null) {
      tab_url = true;
    }
    if ((target != null) && tab_url) {
      if (target.type === "chat") {
        pb.sidebar.tab = pb.sidebar.people;
      } else if (target.type === "device") {
        pb.sidebar.tab = pb.sidebar.devices;
      } else {
        pb.sidebar.tab = pb.sidebar.following;
      }
    }
    pb.sidebar.target = target;
    pb.pushform.target = target;
    pb.pushbox.target = target;
    pb.pushbox.scroll_lock = true;
    return pb.db.set("sidebar_target", pb.sidebar.target);
  };

}).call(this);

// from 'src/views/pushes.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var contains, draw_chat_bubble, draw_image_ghost, oklink, one_of, pix_for_push, push_direction, push_originator_iden;

  eval(onecup["import"]());

  pb.PUSH_PER_PAGE = 25;

  pb.pushes = {};

  contains = function(a, b) {
    return a.toLowerCase().indexOf(b.toLowerCase()) !== -1;
  };

  pb.pushes.filter = function(target, push) {
    var channel, client, email, iden, receiver, sender, source;
    if (target) {
      if (target.type === "chat") {
        email = target.obj["with"].email_normalized;
        receiver = push.receiver_email_normalized === email;
        sender = push.sender_email_normalized === email;
        return receiver || sender;
      }
      if (target.type === "device") {
        iden = target != null ? target.obj.iden : void 0;
        source = push.source_device_iden === iden;
        target = push.target_device_iden === iden;
        return source || target;
      }
      if (target.type === "grant") {
        client = target != null ? target.obj.client : void 0;
        return push.client_iden === client.iden;
      }
      if (target.type === "subscription") {
        channel = target != null ? target.obj.channel : void 0;
        return push.channel_iden === channel.iden;
      }
      if (target.type === "channel") {
        return push.channel_iden === target.obj.iden;
      }
      return false;
    } else {
      if (push.direction === "self") {
        return true;
      }
      return false;
    }
  };

  pb.show_pushes = pb.PUSH_PER_PAGE;

  views.draw_pushes = function() {
    var i, j, k, l, len, len1, len2, len3, len4, len5, m, n, o, page_pushes, prev_push, push, pushes, ref, ref1, ref2, results;
    pushes = (function() {
      var j, len, ref, results;
      ref = pb.api.pushes.all;
      results = [];
      for (j = 0, len = ref.length; j < len; j++) {
        push = ref[j];
        if (pb.pushes.filter(pb.pushbox.target, push)) {
          results.push(push);
        }
      }
      return results;
    })();
    if (pb.api.devices.is_awake()) {
      for (j = 0, len = pushes.length; j < len; j++) {
        push = pushes[j];
        if (push.direction === "self") {
          if (!push.dismissed && !push.target_device_iden) {
            pb.api.pushes.dismiss(push);
          }
        } else if (push.direction === "incoming") {
          if (!push.dismissed) {
            console.log("dismiss push", push.body);
            pb.api.pushes.dismiss(push);
          }
        }
      }
      for (k = 0, len1 = pushes.length; k < len1; k++) {
        push = pushes[k];
        if (pb.api.pushes.should_notify(push)) {
          pb.api.pushes.notified(push);
          refresh();
        }
      }
    }
    ref = pb.api.pushes.error_queue;
    for (l = 0, len2 = ref.length; l < len2; l++) {
      push = ref[l];
      pushes.unshift(push);
    }
    ref1 = pb.api.pushes.queue;
    for (m = 0, len3 = ref1.length; m < len3; m++) {
      push = ref1[m];
      pushes.unshift(push);
    }
    ref2 = pb.api.pushes.file_queue;
    for (n = 0, len4 = ref2.length; n < len4; n++) {
      push = ref2[n];
      pushes.unshift(push);
    }
    page_pushes = pushes;
    page_pushes.reverse();
    div(".pushwrap.pointer", function() {
      margin(20);
      text_align("center");
      font_weight("bold");
      font_size(15);
      if (pb.api.history.loading(pb.pushbox.target)) {
        icon(".icon-spinner.icon-spin");
        return text(" Loading...");
      } else if (pb.api.history.top(pb.pushbox.target)) {
        return text("No more history");
      } else {
        text("Load more");
        return onclick(function() {
          track("pushes_more");
          return pb.api.history.load_more(pb.pushbox.target);
        });
      }
    });
    if (pushes.length === 0) {
      if (pb.api.pushes.getting) {
        div(".pushwrap", function() {
          text_align("center");
          icon(".icon-spinner.icon-spin");
          return text("Loading...");
        });
      } else {
        if ((pb.pushform.target != null) && pb.sidebar.sub_tab !== "me") {
          div(".pushwrap", function() {
            var ref3;
            width("100%");
            position("absolute");
            bottom(0);
            text_align("center");
            margin("60px 0px");
            color(colors.gray2);
            if ((ref3 = pb.pushform.target.type) === "chat" || ref3 === "email") {
              return text("Say hello to " + pb.pushform.target.name);
            } else {
              return text("Share something with " + pb.pushform.target.name);
            }
          });
        }
      }
    }
    prev_push = null;
    results = [];
    for (i = o = 0, len5 = page_pushes.length; o < len5; i = ++o) {
      push = page_pushes[i];
      results.push(div(".pushwrap", function() {
        width("100%");
        position("absolute");
        bottom(0);
        return draw_push(push, page_pushes[i - 1], page_pushes[i + 1]);
      }));
    }
    return results;
  };

  window.draw_push = function(push, prev_push, next_push) {
    return draw_chat_bubble(push, prev_push, next_push);
  };

  one_of = function(str, list) {
    var e, j, len;
    for (j = 0, len = list.length; j < len; j++) {
      e = list[j];
      if (e === str) {
        return true;
      }
    }
    return false;
  };

  pix_for_push = function(push) {
    var channel, chat, client, device, device_iden, email, grant, ref, subscription;
    if (push.channel_tag) {
      channel = pb.api.channels.info(push.channel_tag);
      if (channel != null) {
        return channel.image_url;
      } else {
        return pb.api.contacts.default_image_url;
      }
    } else if (push.channel_iden) {
      subscription = pb.api.subscriptions.by_channel_iden(push.channel_iden);
      if (subscription != null) {
        channel = subscription.channel;
        return channel.image_url;
      } else {
        return pb.api.contacts.default_image_url;
      }
    } else if (push.client_iden) {
      grant = pb.api.grants.by_client_iden(push.client_iden);
      if (grant) {
        client = grant.client;
        return client.image_url;
      } else {
        return pb.api.contacts.default_image_url;
      }
    } else if (push.sender_iden !== push.receiver_iden) {
      if (push.sender_iden === pb.account.iden) {
        return pb.account.image_url || pb.api.contacts.default_image_url;
      } else {
        email = push.sender_email_normalized;
        chat = pb.api.chats.by_email(email);
        if (!chat) {
          return pb.api.chats.default_image_url;
        }
        return chat["with"].image_url || pb.api.chats.default_image_url;
      }
    } else if (pb.sidebar.target === null || ((ref = pb.sidebar.target) != null ? ref.type : void 0) === "device") {
      device_iden = push.source_device_iden;
      device = pb.api.devices.objs[device_iden];
      if (device != null) {
        return pb.api.devices.guess_icon(device);
      }
      return pb.api.devices.default_image_url;
    }
    return pb.account.image_url;
  };

  push_direction = function(push) {
    var direction, my_iden, orig_iden, ref, ref1;
    if ((ref = location.pathname) === "/channel" || ref === "/channel-popup") {
      return "left";
    }
    orig_iden = push_originator_iden(push);
    if (pb.sidebar.target === null || ((ref1 = pb.sidebar.target) != null ? ref1.type : void 0) === "device") {
      my_iden = void 0;
    } else {
      my_iden = pb.account.iden;
    }
    if (orig_iden === my_iden) {
      direction = "right";
    } else {
      direction = "left";
    }
    return direction;
  };

  push_originator_iden = function(push) {
    var ref, ref1;
    if (!push) {
      return null;
    }
    if (pb.sidebar.target === null || ((ref = pb.sidebar.target) != null ? ref.type : void 0) === "device") {
      if (!push.source_device_iden) {
        return (ref1 = pb.device) != null ? ref1.iden : void 0;
      }
      return push.source_device_iden;
    } else {
      return push.sender_iden;
    }
  };

  draw_chat_bubble = function(push, prev_push, next_push) {
    var bubble_width, direction, ref, time, time_bar, time_str;
    if (!prev_push || Math.abs(prev_push.created - push.created) > 60 * 15) {
      time = new moment(push.created * 1000);
      time_bar = time.calendar();
      div(function() {
        margin("10px 0px");
        text_align("center");
        font_size(15);
        color(colors.gray2);
        return text(time_bar);
      });
    }
    bubble_width = pb.pushbox.width_mainbar - 100;
    if (bubble_width > 500) {
      bubble_width = 500;
    }
    time_str = false;
    direction = push_direction(push);
    div(".pushbubble", function() {
      ondblclick(function() {
        return console.log(push);
      });
      overflow("hidden");
      return div(function() {
        var created, needs_chunk, next_same_sender, prev_same_sender;
        position("relative");
        width(bubble_width);
        min_height(32);
        margin_top(2);
        margin_left(10);
        margin_right(10);
        margin_bottom(2);
        font_size(15);
        line_height(18);
        prev_same_sender = prev_push && prev_push.sender_iden === push.sender_iden;
        next_same_sender = next_push && next_push.sender_iden === push.sender_iden;
        float(direction);
        if (!next_push) {
          created = push.created * 1000;
          if (created > Date.now() - 60 * 5000) {
            if (direction === "right") {
              time_str = "Sent";
            }
          } else {
            time = new moment(push.created * 1000);
            time_str = time.fromNow();
          }
          if (push.ghost && !push.error) {
            time_str = "Sending";
          }
        } else {
          time_str = false;
        }
        needs_chunk = push_originator_iden(push) !== push_originator_iden(next_push);
        if (needs_chunk || time_str) {
          margin_bottom(10);
          raw_img({
            src: pb.api.resize_img(pix_for_push(push), 68 * 2)
          }, function() {
            position("absolute");
            if (direction === "right") {
              right(0);
            } else {
              left(0);
            }
            bottom(0);
            width(40);
            height(40);
            return border_radius(20);
          });
          if (direction === "right") {
            div(function() {
              position("absolute");
              bottom(0);
              right(40);
              width(0);
              height(0);
              border_style("solid");
              border_width("10px 0 0 15px");
              return border_color("transparent transparent transparent " + colors.me);
            });
          } else {
            div(function() {
              position("absolute");
              bottom(0);
              left(38);
              width(0);
              height(0);
              border_style("solid");
              border_width("0 0 10px 15px");
              return border_color("transparent transparent " + colors.other + " transparent");
            });
          }
        }
        return div(".text-part", function() {
          var aspect, exact_size, h, image_url, post_push, ratio, sh, sw, text_color, w;
          display("block");
          position("relative");
          max_width("100%");
          word_wrap("break-word");
          white_space("pre-wrap");
          border_radius(4);
          min_height(37);
          min_width(20);
          if (direction === "right") {
            margin_right(50);
            background_color(colors.me);
            text_color = color.gray4;
          } else {
            background_color(colors.other);
            text_color = "white";
            margin_left(50);
          }
          float(direction);
          color(text_color);
          if (push.image_url != null) {
            post_push = true;
          }
          if (push.title) {
            div(function() {
              margin(10);
              font_weight("bold");
              return text(push.title);
            });
          }
          if (push.body) {
            div(function() {
              margin(10);
              return raw(linkify.linkify(push.body));
            });
          }
          if (push.url) {
            div(function() {
              white_space("nowrap");
              text_overflow("ellipsis");
              overflow("hidden");
              margin(10);
              if (oklink(push.url)) {
                return a({
                  href: push.url,
                  target: "_blank"
                }, function() {
                  color(text_color);
                  return text(push.url);
                });
              } else {
                return text(push.url);
              }
            });
          }
          if (!push.image_url && push.file_name) {
            div(function() {
              margin(10);
              if (push.file_url && oklink(push.file_url)) {
                return a({
                  href: push.file_url,
                  target: "_blank"
                }, function() {
                  color(text_color);
                  return text(push.file_name);
                });
              } else {
                return text(push.file_name);
              }
            });
          }
          if (push.image_url) {
            if (push.image_url.slice(0, 5) === "http:") {
              push.image_url = "https:" + push.image_url.slice(5);
            }
            if ((push.image_width != null) && (push.image_height != null)) {
              ratio = window.devicePixelRatio || 1;
              exact_size = true;
              w = bubble_width - 20;
              if (push.image_width > w) {
                aspect = push.image_width / push.image_height;
                image_url = push.image_url;
                sw = 480 * ratio;
                sh = Math.floor(480 / aspect) * ratio;
                if (image_url.indexOf("imgix") !== -1) {
                  image_url += "?w=" + sw + "&h=" + sh + "&fit=crop";
                } else if (image_url.indexOf("data") !== -1) {
                  image_url = image_url;
                } else {
                  image_url += "=s" + (Math.max(sw, sh));
                }
                h = Math.floor(w / aspect);
              } else {
                w = push.image_width;
                h = push.image_height;
                image_url = push.file_url;
              }
            } else {
              exact_size = false;
              image_url = push.file_url;
              w = bubble_width - 20;
            }
            onecup.raw_img("#image-" + push.iden, {
              src: image_url
            }, function() {
              margin(10);
              cursor("pointer");
              if (exact_size) {
                width(w);
                height(h);
              } else {
                max_width(w);
              }
              return onclick(function() {
                return window.open(push.file_url);
              });
            });
          }
          if (push.progress) {
            div(function() {
              margin(10);
              background("white");
              return div(function() {
                width(Math.floor(push.progress) + "%");
                height(10);
                return background(colors.gray3);
              });
            });
          }
          if (push.error) {
            div(function() {
              margin(10);
              color(colors.red);
              return text(push.error);
            });
            if (push.error.indexOf("File is too big.") !== -1) {
              a({
                href: "/pro",
                target: "_blank"
              }, function() {
                margin(10);
                text("Upgrade to Pushbullet Pro");
                return onclick(function() {
                  return track("go_upgrade", {
                    source: "file_too_large"
                  });
                });
              });
            }
            div(".pointer", function() {
              margin(10);
              text("Retry");
              return onclick(function() {
                pb.pushbox.scroll_lock = true;
                return pb.api.pushes.retry_send(push);
              });
            });
            time_str = "not sent";
          }
          if (!push.no_x) {
            return div(".x.pointer", function() {
              position("absolute");
              top(0);
              if (direction === "right") {
                left(-25);
              } else {
                right(-25);
              }
              color(colors.gray2);
              icon(".pushfont-close");
              return onclick(function() {
                if (push.error) {
                  track("push_error_remove", {
                    type: push.type
                  });
                  return pb.api.pushes.remove_from_error_queue(push);
                } else if (push.progress) {
                  track("file_abort", {
                    type: push.type,
                    file_type: push.file_type
                  });
                  return pb.api.pushes.upload_abort(push);
                } else if (push.ghost) {
                  track("ghost_delete", {
                    type: push.type
                  });
                  return pb.api.pushes.remove_from_queue(push);
                } else {
                  track("push_delete", {
                    type: push.type
                  });
                  return pb.api.pushes["delete"](push);
                }
              });
            });
          }
        });
      });
    });
    if ((ref = location.pathname) === "/channel" || ref === "/channel-popup") {
      return;
    }
    if (time_str && !push.progress) {
      return div(function() {
        if (direction === "right") {
          text_align("right");
        }
        padding_left(60);
        padding_right(60);
        padding_bottom(10);
        font_size(15);
        opacity(".7");
        return text(time_str);
      });
    }
  };

  draw_image_ghost = function() {
    return div(function() {
      var image_url;
      opacity(".3");
      overflow("hidden");
      padding_left(10);
      image_url = pb.pushform.file_image_preview;
      return onecup.raw_img({
        src: image_url,
        width: "200px"
      });
    });
  };

  oklink = function(url) {
    return url.slice(0, 7) === "http://" || url.slice(0, 8) === "https://";
  };

}).call(this);

// from 'src/views/devices.js'
// Generated by CoffeeScript 1.10.0
(function() {
  eval(onecup["import"]());

  views.new_device = function() {
    var app_link, apps;
    div(function() {
      padding(20);
      max_width(700);
      margin("0px auto");
      h2(function() {
        return text("Get Pushbullet:");
      });
      return p(function() {
        text("To add another device, just install the Pushbullet app and sign in using your Google or Facebook account. It will be added to your account automatically.");
        return margin_bottom(40);
      });
    });
    app_link = function(app) {
      var name, small_text, type, url;
      type = app[0], name = app[1], small_text = app[2];
      url = pb.URLS[type];
      return a(".hover-fade", {
        href: url,
        target: "_blank"
      }, function() {
        display("block");
        float("left");
        width(160);
        height(160);
        text_align("center");
        text_decoration("none");
        img(".image", {
          src: "/img/apps/app-" + type + ".png",
          height: "80px"
        });
        div(function() {
          margin_top(10);
          color(colors.gray3);
          text(name);
          return div(".small", function() {
            font_size(14);
            color(colors.gray2);
            return text(small_text);
          });
        });
        return onclick(function() {
          return track("device_new", {
            type: type
          });
        });
      });
    };
    apps = [["android", "Android"], ["ios", "iPhone"], ["windows", "Windows"], ["chrome", "Chrome"], ["firefox", "Firefox"], ["opera", "Opera"]];
    return grid_layout({
      width: pb.pushbox.width_mainbar,
      max: 3,
      element_width: 160,
      element_height: 160,
      elements: apps,
      draw: app_link
    });
  };

}).call(this);

// from 'src/views/pushform.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var divider, is_link_regex, sidebar_target;

  eval(onecup["import"]());

  pb.pushform = {
    target: null,
    expanded: true,
    type: "note",
    title: "",
    content: "",
    url: "",
    address: "",
    file_name: "",
    file_url: "",
    file_type: "",
    file_progress: 0,
    message: null,
    error_message: null,
    waiting: false,
    file_name: null,
    to_selection: 0,
    picker: new Picker({
      direction: "top",
      placeholder: "Select device",
      clear_on_click: true,
      cb: function(target) {
        return pb.pushform.target = target;
      }
    })
  };

  pb.pushform.clear = function() {
    var ref;
    pb.pushform.title = "";
    pb.pushform.type = "note";
    pb.pushform.content = "";
    pb.pushform.clear_extra();
    return (ref = document.getElementById("pushing-form")) != null ? ref.reset() : void 0;
  };

  pb.pushform.clear_message = (function(_this) {
    return function() {
      pb.pushform.message = "";
      pb.pushform.error_message = "";
      return pb.pushform.waiting = "";
    };
  })(this);

  pb.pushform.clear_extra = function() {
    pb.pushform.url = "";
    pb.pushform.file_name = "";
    pb.pushform.file_url = "";
    return pb.pushform.file_type = "";
  };

  pb.pushform.select_target = function(target) {
    return pb.pushform.target = target;
  };

  sidebar_target = function() {
    var target;
    if (pb.sidebar.selected) {
      if (pb.sidebar.selected_type === "email") {
        target = {
          name: pb.sidebar.selected.email,
          image_url: pb.api.contacts.default_image_url,
          obj: pb.sidebar.selected
        };
        return target;
      }
      return pb.targets.make(pb.sidebar.selected);
    }
  };

  pb.pushform.show_to = function() {
    return pb.sidebar.target === null;
  };

  is_link_regex = new RegExp('^https?:\/\/[\\w.\\-\/?=;,+*~!()\':#\\[@\\]\\$%&]+$');

  pb.pushform.send = function(e) {
    var box, push, ref, ref1, ref2, ref3, ref4, ref5, ref6;
    pb.pushform.content = "";
    pb.pushbox.scroll_lock = true;
    push = {};
    push.type = "note";
    push.title = ((ref = onecup.lookup("#title")) != null ? ref.value : void 0) || "";
    push.body = ((ref1 = onecup.lookup("#message")) != null ? ref1.value : void 0) || "";
    push.url = ((ref2 = onecup.lookup("#url")) != null ? ref2.value : void 0) || "";
    if ((ref3 = onecup.lookup("#title")) != null) {
      ref3.value = "";
    }
    if ((ref4 = onecup.lookup("#message")) != null) {
      ref4.value = "";
    }
    push.title = push.title.trim();
    push.body = push.body.trim();
    push.url = push.url.trim();
    if (push.title === "" && push.body === "" && push.url === "") {
      box = document.getElementById("message");
      box.value = "";
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (push.url === "" && push.body.match(is_link_regex)) {
      push.url = push.body;
      push.body = "";
    }
    if (push.url !== "") {
      push.type = "link";
    }
    pb.api.pushes.send(push);
    box = document.getElementById("message");
    box.selectionStart = 0;
    box.selectionEnd = 0;
    box.value = "";
    if ((ref5 = document.getElementById("title")) != null) {
      ref5.value = "";
    }
    return (ref6 = document.getElementById("url")) != null ? ref6.value = "" : void 0;
  };

  divider = function() {
    return div(".divider", function() {
      height("1px");
      width("100%");
      return background(colors.white2);
    });
  };

  views.pushform = function() {
    var ref, ref1;
    if ((ref = (ref1 = pb.sidebar.target) != null ? ref1.type : void 0) === "subscription" || ref === "grant") {
      return;
    }
    pb.pushform.showing = true;
    return div(function() {
      var device_targets, ref2;
      if (pb.pushform.show_to()) {
        divider();
        device_targets = pb.targets.devices();
        if (!pb.pushform.target) {
          pb.pushform.target = device_targets[0];
          pb.pushform.picker.target = pb.pushform.target;
        }
        pb.pushform.picker.draw(device_targets);
      }
      if (((ref2 = pb.sidebar.target) != null ? ref2.type : void 0) === "channel") {
        divider();
        input("#title", {
          type: "text",
          placeholder: "Optional title",
          value: "",
          autocomplete: "off"
        }, function() {
          margin_bottom(0);
          return border("none");
        });
        divider();
        input("#url", {
          type: "text",
          placeholder: "Optional link",
          value: "",
          autocomplete: "off"
        }, function() {
          return border("none");
        });
      }
      return div(function() {
        var text_height;
        position("relative");
        text_height = 80;
        height(text_height);
        overflow("hidden");
        divider();
        div("#send-button.pointer", function() {
          position("absolute");
          right(0);
          width("10%");
          font_size(40);
          background_color("white");
          text_align("center");
          height(text_height);
          line_height(text_height);
          if (!pb.pushform.content) {
            icon(".pushfont-paperclip");
            return input({
              type: "file",
              multiple: true
            }, function() {
              position("absolute");
              top(0);
              right(0);
              background("red");
              width("100%");
              height("100%");
              opacity("0.000001");
              return onchange(function(e) {
                var file, i, len, ref3, results;
                if (e.target.files) {
                  ref3 = e.target.files;
                  results = [];
                  for (i = 0, len = ref3.length; i < len; i++) {
                    file = ref3[i];
                    results.push(pb.api.pushes.send_file(file));
                  }
                  return results;
                }
              });
            });
          } else {
            icon(".pushfont-send");
            return onclick(function(e) {
              return pb.pushform.send(e);
            });
          }
        });
        return textarea("#message", {
          type: "text",
          placeholder: "Type a message or drop a file"
        }, function() {
          height(text_height - 1);
          position("absolute");
          left(0);
          padding_top(14);
          padding_left(14);
          width("90%");
          float("left");
          border("none");
          overflow_y("auto");
          onkeydown(function(e) {
            if (e.which === 13 && !e.shiftKey) {
              pb.pushform.send(e);
              e.preventDefault();
            } else {
              onecup.no_refresh();
            }
          });
          oninput(function(e) {
            var before;
            before = pb.pushform.content;
            pb.pushform.content = e.target.value;
            if (before === "" && pb.pushform.content !== "") {
              return;
            }
            if (before !== "" && pb.pushform.content === "") {
              return;
            }
            return onecup.no_refresh();
          });
          return text(pb.pushform.content);
        });
      });
    });
  };

}).call(this);

//# sourceMappingURL=pushform.js.map

// from 'src/views/pushbox.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var oldLocation, old_b, position_chats_properly, pushbox_right_list, remmber, single_push;

  eval(onecup["import"]());

  pb.pushbox = {
    target: null,
    scroll_lock: true
  };

  remmber = function(key, what, other) {
    if (!what) {
      what = pb.db.get(key) || other;
    } else {
      pb.db.set(key, what);
    }
    return what;
  };

  pb.pushbox.from_url = function() {
    var device, extra, folder, hash, original_what, ref, ref1, target, what;
    hash = window.location.hash;
    pb.path = hash.split("/");
    ref = pb.path, folder = ref[0], what = ref[1], extra = ref[2];
    original_what = what;
    if (hash === "") {
      if (pb.setup.should_show()) {
        return pb.sidebar.set_minitab("setup", "progress");
      } else {
        pb.sidebar.set_minitab("people", "me");
        return pb.sidebar.select(null, null, false);
      }
    } else if (folder === "#setup") {
      what = remmber("last_setup_tab", what, "progress");
      return pb.sidebar.set_minitab("setup", what);
    } else if (folder === "#people") {
      pb.sidebar.set_minitab("people");
      what = remmber("last_person_email", what, "me");
      if (what === "me") {
        pb.sidebar.set_minitab("people", "me");
        return pb.sidebar.select(null, null, false);
      } else if (what === "new") {
        pb.sidebar.set_minitab("people", "new");
        return pb.sidebar.select(null, null, false);
      } else {
        target = pb.targets.by_email(what);
        if (!target) {
          if (original_what == null) {
            pb.sidebar.set_minitab("people", "me");
            pb.sidebar.select(null, null, false);
            return;
          }
          pb.api.chats.create(what);
          target = pb.targets.make_email(what);
        }
        return pb.sidebar.select_target(target, false);
      }
    } else if (folder === "#devices") {
      pb.sidebar.set_minitab("devices");
      what = remmber("last_device_iden", what, "new");
      if (what === "new") {
        pb.sidebar.set_minitab("devices", "new");
        return pb.sidebar.select(null, null, false);
      } else {
        target = pb.targets.by_device_iden(what);
        return pb.sidebar.select_target(target, false);
      }
    } else if (folder === "#following") {
      pb.sidebar.set_minitab("following");
      what = remmber("last_following_tag", what, "new");
      if (what === "new") {
        pb.sidebar.set_minitab("following", "new");
        return pb.sidebar.select(null, null, false);
      } else {
        target = pb.targets.by_tag(what);
        return pb.sidebar.select_target(target, false);
      }
    } else if (folder === "#settings") {
      pb.api.pinger.ping_all();
      what = remmber("last_settings_tab", what, "account");
      return pb.sidebar.set_minitab("settings", what);
    } else if (folder === "#sms") {
      pb.sidebar.set_minitab("sms", what);
      what = remmber("last_sms_device_iden", what, void 0);
      extra = remmber("last_sms_thread_id", extra, null);
      if (what === void 0) {
        what = (ref1 = pb.api.sms.first_sms_device()) != null ? ref1.iden : void 0;
      }
      if (what) {
        device = pb.api.devices.objs[what];
        if (device) {
          target = pb.targets.make(device);
          pb.sms.target = target;
          pb.sms.picker.target = target;
          pb.api.sms.fetch_device();
        }
      }
      if (extra === "new") {
        console.log("new tab");
        pb.sidebar.sub_tab = "new";
        return pb.api.sms.current_thread = null;
      } else if (extra) {
        pb.sms.wants_thread_id = pb.path[2];
        pb.api.sms.fetch_thread(pb.path[2]);
        return pb.sidebar.sub_tab = null;
      }
    } else if (folder === "#remotefiles") {
      pb.api.pinger.ping_all();
      return pb.sidebar.set_minitab("remotefiles", what);
    }
  };

  views.pushbox = function() {
    views.header(true);
    with_view(window.location.toString(), {
      enter: function() {
        var ref;
        pb.show_pushes = pb.PUSH_PER_PAGE;
        if ((ref = document.getElementById("search")) != null) {
          ref.value = "";
        }
        pb.pushform.picker.search = "";
        pb.search.q = "";
        pb.pushform.picker.target = null;
        return pb.pushbox.from_url();
      }
    });
    return div(function() {
      position("absolute");
      top(pb.header.height);
      left(0);
      right(0);
      bottom(0);
      z_index("4");
      return div(function() {
        var width_mainbar, width_minibar, width_right_bars, width_sidebar;
        position("relative");
        height("100%");
        width("100%");
        box_shadow("0 0 8px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.12)");
        margin("0px auto");
        width_minibar = 180;
        width_sidebar = 250;
        width_mainbar = 500;
        if (window.innerWidth < 900) {
          width_minibar = 64;
        }
        width_right_bars = window.innerWidth - width_minibar;
        width_sidebar = Math.floor(width_right_bars * .3);
        width_mainbar = width_right_bars - width_sidebar;
        if (width_mainbar < 400) {
          width_mainbar = 400;
          width_sidebar = window.innerWidth - width_mainbar - width_minibar;
        }
        if (window.innerWidth < 64 + 64 + 400) {
          if (location.hash.split("/").length === 1) {
            width_mainbar = 0;
            width_minibar = 64;
            width_sidebar = window.innerWidth - 64;
          } else {
            width_mainbar = window.innerWidth;
          }
        }
        pb.pushbox.width_minibar = width_minibar;
        pb.pushbox.width_sidebar = width_sidebar;
        pb.pushbox.width_mainbar = width_mainbar;
        div(function() {
          z_index("1");
          position("absolute");
          top(0);
          bottom(0);
          left(0);
          width(width_minibar);
          background_color(colors.gray2);
          views.minitabs();
          return div(function() {
            position("absolute");
            top(0);
            bottom(0);
            width(20);
            right(-20);
            return box_shadow("0 0 8px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.12)");
          });
        });
        div(function() {
          z_index("2");
          position("absolute");
          top(0);
          bottom(0);
          left(width_minibar);
          width(width_sidebar);
          overflow_y("auto");
          overflow_x("hidden");
          padding_top(10);
          background_color(colors.gray1);
          views.sidebar();
          return div(function() {
            position("absolute");
            top(0);
            bottom(0);
            width(20);
            right(-20);
            return box_shadow("0 0 8px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.12)");
          });
        });
        return div("#mainbar", function() {
          z_index("3");
          position("absolute");
          top(0);
          bottom(0);
          right(0);
          width(width_mainbar);
          overflow_y("auto");
          overflow_x("hidden");
          background_color("white");
          return pushbox_right_list();
        });
      });
    });
  };

  pb.chat_heads = {};

  views.chat_head = function() {
    var has_transperancy, image_url, ref, target, top_height;
    pb.pushbox.width_mainbar = window.innerWidth;
    has_transperancy = false;
    if (has_transperancy) {
      top_height = 50 + 70;
      if (pb.sidebar.target) {
        target = pb.sidebar.target;
        image_url = target.image_url;
        if (pb.api.blocks.by_email((ref = target.obj["with"]) != null ? ref.email : void 0)) {
          image_url = "/img/deviceicons/blocked.png";
        }
        raw_img({
          src: image_url
        }, function() {
          position("absolute");
          left(0);
          width(56);
          height(56);
          border_radius(100);
          return ondblclick(function() {
            console.log("chat head click");
            return pb.chat_heads[target.iden] = !pb.chat_heads[target.iden];
          });
        });
      }
      if (pb.chat_heads[target.iden] === true) {
        return;
      }
      div(function() {
        position("absolute");
        left(14);
        top(56);
        width(0);
        height(0);
        border_left("15px solid transparent");
        border_right("15px solid transparent");
        return border_bottom("15px solid " + colors.green2);
      });
      div({
        style: {
          "-webkit-app-region": "drag"
        }
      }, function() {
        z_index("0");
        position("absolute");
        top(70);
        left(0);
        right(0);
        height(50);
        background_color(colors.green2);
        color("white");
        padding(10);
        font_size(22);
        if (pb.sidebar.target) {
          return text(pb.sidebar.target.name);
        } else {
          return text("Me");
        }
      });
    } else {
      top_height = 50;
      div(function() {
        z_index("0");
        position("absolute");
        top(0);
        left(0);
        right(0);
        height(50);
        background_color(colors.green2);
        color("white");
        padding(10);
        font_size(22);
        if (pb.sidebar.target) {
          return text(pb.sidebar.target.name);
        } else {
          return text("Me");
        }
      });
    }
    return div(function() {
      z_index("0");
      position("absolute");
      top(top_height);
      left(0);
      bottom(0);
      right(0);
      return pushbox_right_list();
    });
  };

  pushbox_right_list = function() {
    var ref;
    if (pb.sidebar.sub_tab === "new") {
      if (pb.sidebar.tab.name === "devices") {
        views.new_device();
      }
      if (pb.sidebar.tab.name === "people") {
        views.new_chat();
      }
      if (pb.sidebar.tab.name === "following") {
        views.new_channel();
      }
      if (pb.sidebar.tab.name === "sms") {
        views.new_sms();
      }
    } else if (((ref = pb.sidebar.tab.name) === "people" || ref === "devices" || ref === "following") || pb.sidebar.sub_tab === "me") {
      div("#pushlist", function() {
        position("absolute");
        top(0);
        bottom(300);
        left(0);
        right(0);
        overflow_y("auto");
        overflow_x("hidden");
        display("table-cell");
        vertical_align("bottom");
        background("white");
        return div("#innerlist", function() {
          position("relative");
          return views.draw_pushes();
        });
      });
      div("#pushform", function() {
        z_index("6");
        position("absolute");
        bottom(0);
        left(0);
        right(0);
        background(colors.gray1);
        return views.pushform();
      });
    } else if (pb.sidebar.tab.name === "settings") {
      views.settings();
    } else if (pb.sidebar.tab.name === "setup") {
      views.setup();
    } else if (pb.sidebar.tab.name === "sms") {
      views.sms();
    } else if (pb.sidebar.tab.name === "remotefiles") {
      views.remotefiles_view();
    }
    return onecup.post_render(position_chats_properly);
  };

  old_b = 0;

  oldLocation = null;

  position_chats_properly = function() {
    var b, diff, div, divs, i, innerlist, j, k, len, node_list, pushfrom, pushlist, ref, ref1, scroll;
    pushlist = document.getElementById("pushlist");
    innerlist = document.getElementById("innerlist");
    pushfrom = document.getElementById("pushform");
    if (location.toString() !== oldLocation && !pb.header.mobile) {
      oldLocation = location.toString();
      if ((ref = document.getElementById("message")) != null) {
        ref.focus();
      }
    }
    if (!pushlist) {
      return;
    }
    if (pushfrom) {
      pushlist.style.bottom = pushfrom.clientHeight + "px";
    } else {
      pushlist.style.bottom = "0px";
    }
    divs = [];
    node_list = document.getElementsByClassName("pushwrap");
    for (i = j = ref1 = node_list.length; ref1 <= 0 ? j < 0 : j > 0; i = ref1 <= 0 ? ++j : --j) {
      divs.push(node_list[i - 1]);
    }
    b = 0;
    for (k = 0, len = divs.length; k < len; k++) {
      div = divs[k];
      div.style.bottom = b + "px";
      b += div.clientHeight;
    }
    scroll = pushlist.scrollTop;
    if (old_b === 0) {
      old_b = b;
      scroll = b;
    } else if (old_b !== b) {
      diff = b - old_b;
      old_b = b;
      scroll += diff;
    }
    innerlist.style.height = b + "px";
    innerlist.style.minHeight = pushlist.clientHeight + "px";
    if (pb.pushbox.scroll_lock) {
      pb.pushbox.scroll_lock = false;
      scroll = b;
    }
    return pushlist.scrollTop = scroll;
  };

  single_push = function() {
    var push;
    push = pb.api.pushes.objs[onecup.params.push_iden];
    if (push) {
      return draw_push(push);
    } else {
      if (pb.api.pushes.loaded) {
        return p(function() {
          return text("push not found");
        });
      } else {
        return p(function() {
          icon(".icon-spinner.icon-spin");
          return text("loading...");
        });
      }
    }
  };

}).call(this);

// from 'src/views/channels.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var CHANNEL_PIC_SIZE, amazon_to_imgix, categories, channel_categories, channel_form, draw_category, draw_category_card, draw_channel, feed_filter, find_category, form_feed_filter_field, object, push_preview, set_feed_filter_field, tools, words,
    indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  eval(onecup["import"]());

  pb.channels = {};

  pb.channels.uploading = false;

  pb.channels.file_url = null;

  CHANNEL_PIC_SIZE = 188;

  amazon_to_imgix = function(image_url) {
    var amazon, imgix;
    imgix = "https://pushbullet.imgix.net/";
    amazon = "https://s3.amazonaws.com/pushbullet-uploads/";
    return image_url.replace(amazon, imgix);
  };

  pb.channel_create = {};

  pb.channel_create.expanded = false;

  object = {};

  feed_filter = null;

  form_feed_filter_field = function(object) {
    if (object.feed_filters != null) {
      console.log("from object.feed_filters", object.feed_filters[0].value);
      return object.feed_filters[0].value;
    }
  };

  set_feed_filter_field = function(object, title_filter) {
    object.feed_filters = [
      {
        "field": "title",
        "value": title_filter,
        "operator": "contains",
        "ignore_case": true
      }
    ];
    return console.log("set object.feed_filters", object.feed_filters, "from", title_filter);
  };

  words = function() {
    return p(".explan-text", function() {
      text("Channels are push notifications feeds that can be subscribed to. ");
      return text("Anything you push to a channel will instantly go to all of the channel's subscribers. Only the owner of a channel can push to it.");
    });
  };

  tools = function() {
    var channel_tag;
    channel_tag = object.tag || "";
    div(".area", function() {
      h2(function() {
        return text("Share this link");
      });
      return input({
        type: "text",
        readonly: "readonly",
        value: mk_url("https://www.pushbullet.com/channel", {
          tag: channel_tag
        })
      });
    });
    return div(".area", function() {
      h2({
        style: {
          "margin-bottom": "10px"
        }
      }, function() {
        return text("Add this button to your site");
      });
      div("#widget", function() {
        i();
        return span("#label", function() {
          text("Subscribe to ");
          return span("#channel", function() {
            return text(object.name || "Channel Name");
          });
        });
      });
      return textarea({
        readonly: "readonly",
        wrap: "off",
        style: {
          height: "90px",
          "margin-top": "12px"
        }
      }, function() {
        return text("<a class=\"pushbullet-subscribe-widget\" data-channel=\"" + channel_tag + "\" data-widget=\"button\" data-size=\"small\"></a>\n<script type=\"text/javascript\">(function(){var a=document.createElement('script');a.type='text/javascript';a.async=true;a.src='https://widget.pushbullet.com/embed.js';var b=document.getElementsByTagName('script')[0];b.parentNode.insertBefore(a,b);})();</script>");
      });
    });
  };

  channel_form = function(object, image_url, imgix_url, feed_filter, edit_channel_tag) {
    var set;
    set = function(field, cb) {
      return function(e) {
        object[field] = e.target.value;
        if (cb) {
          return cb(e.target.value);
        }
      };
    };
    h2(function() {
      margin_bottom(10);
      return text("Channel information");
    });
    return div(".object", function() {
      var error_msg;
      error_msg = "";
      div(".pic-loading", function() {
        if (pb.channels.uploading) {
          return icon(".icon-spinner.icon-spin");
        }
      });
      input("#file.pic-file.pointer", {
        type: "file",
        name: "file",
        onchange: function(e) {
          var file;
          file = onecup.lookup('#file').files[0];
          pb.channels.uploading = true;
          return pb.api.pushes.upload_file(file, function(upload) {
            pb.channels.uploading = false;
            pb.channels.file_url = upload != null ? upload.file_url : void 0;
            object.image_url = upload != null ? upload.file_url : void 0;
            return console.log("uploaded file?", upload, object);
          });
        }
      });
      raw_img(".pic", {
        src: image_url
      });
      div(".side", function() {
        var css;
        if (!edit_channel_tag) {
          css = "";
          div(".chan-message", function() {
            top(5);
            if (object["tag"]) {
              if (pb.api.channels.exists(object["tag"])) {
                error_msg = "Tag taken";
              } else if (indexOf.call(object["tag"], " ") >= 0) {
                error_msg = "No spaces";
              } else if (!object["tag"].match("^[A-Za-z0-9\-\_]*$")) {
                error_msg = "Invalid symbol";
              }
              if (error_msg) {
                return div(".error", function() {
                  text(error_msg);
                  return css += ".red";
                });
              }
            }
          });
          input("#tag.tag.first" + css, {
            type: "text",
            name: "tag",
            placeholder: "#tag",
            onkeyup: set("tag"),
            value: object.tag
          });
        } else {
          input("#tag.tag.first", {
            type: "text",
            name: "tag",
            placeholder: "#tag",
            readonly: "readonly",
            value: object.tag
          });
        }
        return input("#name.name", {
          type: "text",
          name: "name",
          placeholder: "Channel name",
          onkeyup: set("name"),
          value: object.name
        });
      });
      textarea(".description", {
        name: "description",
        placeholder: "Description",
        onkeyup: set("description")
      }, function() {
        return text(object.description);
      });
      if (pb.channel_create.expanded) {
        input("#feed_url", {
          type: "text",
          name: "feed_url",
          placeholder: "RSS feed url",
          onkeyup: set("feed_url"),
          value: object.feed_url
        });
        input("#filter", {
          type: "text",
          name: "filter",
          placeholder: "Only trigger when RSS entry title contains this text (optional)",
          onkeyup: function(e) {
            feed_filter = e.target.value;
            return set_feed_filter_field(object, feed_filter);
          },
          value: feed_filter || ""
        });
      } else {
        div(".pointer", {
          onclick: (function() {
            return pb.channel_create.expanded = true;
          })
        }, function() {
          icon(".icon-plus");
          return text(" RSS feed trigger");
        });
      }
      if (!error_msg) {
        return div(".buttons", function() {
          var create, remove, update;
          if (edit_channel_tag) {
            if (pb.api.channels.delete_check) {
              remove = function() {
                pb.api.channels["delete"](object);
                track("delete_channel", {
                  channel_tag: object.tag
                });
                return goto("/my-channels");
              };
              button(".btn.red", {
                onclick: remove
              }, function() {
                if (pb.api.channels.deleting) {
                  icon(".icon-spinner.icon-spin");
                }
                return text("Delete");
              });
              button(".btn", {
                onclick: (function() {
                  return pb.api.channels.delete_check = false;
                })
              }, function() {
                return text("Cancel");
              });
            } else {
              button(".btn.red", {
                onclick: (function() {
                  return pb.api.channels.delete_check = true;
                })
              }, function() {
                return text("Delete");
              });
            }
            nbsp(5);
            update = function() {
              track("update_channel", {
                channel_tag: object.tag
              });
              return pb.api.channels.update(object);
            };
            return button(".btn.green", {
              onclick: update
            }, function() {
              if (pb.api.channels.updating) {
                icon(".icon-spinner.icon-spin");
              }
              return text("Save");
            });
          } else {
            nbsp(5);
            create = function() {
              track("create_channel", {
                channel_tag: object.tag
              });
              object.subscribe = true;
              return pb.api.channels.create(object);
            };
            return button(".btn.green", {
              onclick: create
            }, function() {
              if (pb.api.channels.creating) {
                icon(".icon-spinner.icon-spin");
              }
              return text("Create channel");
            });
          }
        });
      }
    });
  };

  push_preview = function() {
    return div(".area", function() {
      var example_push, name;
      h2({
        style: {
          "margin-bottom": "10px"
        }
      }, function() {
        return text("Preview");
      });
      name = object["name"] || "your channel";
      example_push = {
        "active": true,
        "iden": "ujBWk0cRQRMsjxn7ZHKpuC",
        "created": Date.now() / 1000 - 60,
        "type": "link",
        "sender_iden": "0",
        "sender_email": name,
        "sender_email_normalized": name,
        "sender_name": "Your Handle",
        "sender_image_url": imgix_url,
        "receiver_iden": "1",
        "receiver_email": "contact@pushbullet.com",
        "receiver_email_normalized": "contact@pushbullet.com",
        "title": "This is an example notification",
        "body": "Your followers will receive something like this when you push to your channel. Everything will be delivered instantly.",
        "items": [],
        "url": "http://yoursupercoollink.com/likewow"
      };
      return div(".example-push", function() {
        return draw_push(example_push);
      });
    });
  };

  views.my_channel = function() {
    var c, channel, edit_channel_tag, j, len, ref;
    with_view("channel", {
      enter: function() {
        object = {};
        pb.channel_create.expanded = false;
        feed_filter = null;
        pb.pushform.clear();
        return onecup.scroll_top();
      },
      exit: function() {
        object = {};
        feed_filter = null;
        return pb.pushform.clear();
      }
    });
    edit_channel_tag = onecup.params.tag;
    ref = pb.api.channels.all;
    for (j = 0, len = ref.length; j < len; j++) {
      c = ref[j];
      if (c.tag === edit_channel_tag) {
        channel = c;
        object = c;
        if (!feed_filter) {
          feed_filter = form_feed_filter_field(object);
        }
        if (object.feed_url) {
          pb.channel_create.expanded = true;
        }
        break;
      }
    }
    return inner(".page.big-crud.channels-crud", function() {
      var image_url;
      div(function() {
        return height(30);
      });
      if (!edit_channel_tag) {
        h1(function() {
          return text("Create a new channel");
        });
      } else {
        h1(function() {
          return text("Edit your channel");
        });
      }

      /*
       * see if we have uploaded an image
      w = 82 * window.devicePixelRatio
      h = 82 * window.devicePixelRatio
      image_url = imgix_url = pb.api.channels.default_image_url
      if object.image_url
          imgix_url = amazon_to_imgix(object.image_url) + "?w=#{w}&h=#{h}&fit=crop"
      if pb.channels.file_url
          if pb.pushform.file_uploaded
              image_url = pb.channels.file_url
              object.image_url = image_url
              imgix_url = amazon_to_imgix(image_url) + "?w=#{w}&h=#{h}&fit=crop"
          else
              image_url = imgix_url = pb.api.channels.default_image_url
       */
      if (object.image_url) {
        image_url = object.image_url;
      } else if (pb.channels.file_url) {
        image_url = pb.channels.file_url;
      } else {
        image_url = pb.api.channels.default_image_url;
      }
      words();
      div(".section.first", function() {
        div(".column", function() {
          return channel_form(object, image_url, image_url, feed_filter, edit_channel_tag);
        });
        return div(".column", function() {
          return tools();
        });
      });
      return div(".footer-space");
    });
  };

  views.my_channels = function() {
    with_view("my_channel", {
      enter: function() {
        return onecup.scroll_top();
      }
    });
    return inner(".page.crud", function() {
      padding("20px 50px");
      h1(function() {
        return text("My Channels");
      });
      return div(".channels", function() {
        var channel, j, len, ref;
        ref = pb.api.channels.all;
        for (j = 0, len = ref.length; j < len; j++) {
          channel = ref[j];
          div(function() {
            float("left");
            margin(10);
            width(190);
            if (i % 4 === 3) {
              margin_right(0);
            }
            if (i % 4 === 0) {
              margin_left(0);
            }
            return draw_channel(channel);
          });
        }
        return div(function() {
          float("left");
          margin(10);
          return div(".channel.pointer.add", {
            onclick: (function() {
              return goto("/my-channel");
            })
          }, function() {
            img(".add-image", {
              src: "/img/channels/not_tombstone.png",
              width: "171px",
              height: "80px"
            });
            return div(".text", function() {
              return text("add channel");
            });
          });
        });
      });
    });
  };

  views.edit_subscriptions = function() {
    with_view("my_subscriptions", {
      enter: function() {
        return onecup.scroll_top();
      }
    });
    return views.pushbox(function() {
      return div(".crud", function() {
        padding(0);
        h2(function() {
          margin_left(10);
          return text("Subscriptions");
        });
        div(".channels", function() {
          var channel, i, j, len, ref, results, subscription;
          ref = pb.api.subscriptions.all;
          results = [];
          for (i = j = 0, len = ref.length; j < len; i = ++j) {
            subscription = ref[i];
            channel = pb.api.channels.info(subscription.channel.tag);
            results.push(div(function() {
              float("left");
              margin(10);
              width(190);
              if (i % 3 === 2) {
                margin_right(0);
              }
              if (i % 3 === 0) {
                margin_left(10);
              }
              return draw_channel(channel);
            }));
          }
          return results;
        });
        return div(".footer-space");
      });
    });
  };

  views.channel = function() {
    var channel;
    with_view("channel." + onecup.params.tag, {
      enter: function() {
        return onecup.scroll_top();
      }
    });
    channel = pb.api.channels.info(onecup.params.tag);
    return div(".page", function() {
      return div(".inner", function() {
        position("relative");
        return div(".channels", function() {
          div(".header", function() {
            position("absolute");
            top(36);
            left(53);
            return draw_channel(channel);
          });
          return div(function() {
            var j, len, push, ref;
            margin_top(30);
            width(540);
            margin_left(280);
            width(620);
            min_height(700);
            console.log("channel", channel);
            h1(function() {
              margin(10);
              return text(channel.name);
            });
            h3(function() {
              color(colors.gray2);
              margin("20px 10px 25px 10px");
              text("@" + channel.tag);
              nbsp(5);
              if (channel.subscriber_count > 5) {
                icon(".icon-star");
                text(channel.subscriber_count);
                return text(" subscribers");
              }
            });
            h3(function() {
              margin(10);
              margin_bottom(40);
              return text(channel.description);
            });
            if (channel.recent_pushes) {
              pb.pushbox.width_mainbar = 600;
              channel.recent_pushes.sort(function(a, b) {
                return a.created - b.created;
              });
              ref = channel.recent_pushes;
              for (j = 0, len = ref.length; j < len; j++) {
                push = ref[j];
                push.channel_tag = channel.tag;
                div(function() {
                  return draw_push(push);
                });
              }
            }
            return p(function() {
              text_align("right");
              return a({
                href: "/channels"
              }, function() {
                position("relative");
                top(20);
                margin("20px 50px 20px 10px");
                text("See more Pushbullet channels");
                return img({
                  src: "/img/channels/channeltv.png"
                }, function() {
                  position("absolute");
                  top(-7);
                  return right(-40);
                });
              });
            });
          });
        });
      });
    });
  };

  views.channel_popup_mobile = function() {
    var channel;
    pb.in_popup = true;
    channel = pb.api.channels.info(onecup.params.tag);
    return div(function() {
      var header_height;
      header_height = 80;
      div(function() {
        position("absolute");
        background(colors.green1);
        top(0);
        left(0);
        right(0);
        height(header_height);
        box_shadow("0 0 4px rgba(0,0,0,.14),0 4px 8px rgba(0,0,0,.28)");
        z_index("4");
        text_align("center");
        line_height(20);
        color("white");
        font_size(18);
        overflow("hidden");
        if (window.innerWidth < 400) {
          padding("10px 60px");
          text("Follow this channel");
          br();
          text("to get notified when");
          br();
          text("new things are posted.");
        } else {
          padding("20px 60px");
          text("Follow this channel to get notified");
          br();
          text("when new things are posted.");
        }
        div(".pointer", function() {
          position("absolute");
          top(24);
          left(24);
          img({
            src: "/img/channelpopup/logo.png",
            height: 32,
            width: 32
          });
          return onclick(function() {
            return open("https://www.pushbullet.com/");
          });
        });
        return div(".pointer", function() {
          position("absolute");
          top(24);
          right(24);
          img({
            src: "/img/channelpopup/help.png",
            height: 32,
            width: 32
          });
          return onclick(function() {
            return open("https://help.pushbullet.com/articles/what-are-pushbullet-channels/");
          });
        });
      });
      div(function() {
        position("absolute");
        top(header_height);
        left(0);
        right(0);
        height(245);
        padding(10);
        background(colors.gray1);
        div(function() {
          var url;
          position("relative");
          height(152);
          width(300);
          if (channel.image_url) {
            url = channel.image_url + ("?w=" + (150 * 2) + "&h=" + (150 * 2) + "&fit=crop");
          } else {
            url = pb.api.channels.default_image_url;
          }
          return raw_img({
            src: url,
            width: 150,
            heigh: 150
          });
        });
        div(function() {
          position("absolute");
          left(170);
          right(0);
          top(10);
          height(150);
          overflow("hidden");
          div(function() {
            margin_bottom(5);
            return a({
              href: mk_url("/channel", {
                tag: channel.tag
              })
            }, function() {
              text_decoration("none");
              font_size(20);
              font_weight("bold");
              return text(channel.name);
            });
          });
          if (channel.subscriber_count) {
            div(".count", function() {
              font_size(16);
              color(colors.gray3);
              text(Number(channel.subscriber_count).toLocaleString());
              return text(" subscribers");
            });
          }
          return div(".description", function() {
            margin_top(5);
            return text(channel.description);
          });
        });
        div(".pointer", function() {
          margin("15px auto");
          height(50);
          width(200);
          background(colors.green2);
          color("white");
          text_align("center");
          line_height(50);
          font_size(20);
          if (!pb.account) {
            onclick(function() {
              return goto(mk_url("/signin", {
                source: "channel",
                next: mk_url("/channel-popup", {
                  tag: channel.tag,
                  auto: "follow"
                })
              }));
            });
            return text("FOLLOW");
          } else {
            if (pb.api.subscriptions.is_subscribed(channel)) {
              background(colors.gray2);
              onclick(function() {
                track("unsubscribe", {
                  channel_tag: channel.tag
                });
                return pb.api.subscriptions.unsubscribe(channel);
              });
              return text("UNFOLLOW");
            } else if (pb.api.subscriptions.creating) {
              return div(".tag", function() {
                icon(".icon-spinner.icon-spin");
                return text("FOLLOWING");
              });
            } else {
              onclick(function() {
                track("subscribe", {
                  channel_tag: channel.tag
                });
                return pb.api.subscriptions.subscribe(channel);
              });
              return text("FOLLOW");
            }
          }
        });
        z_index("2");
        overflow("hidden");
        return box_shadow("0 0 4px rgba(0,0,0,.14),0 4px 8px rgba(0,0,0,.28)");
      });
      return div("#chat-pushlist", function() {
        var j, len, push, pushes, results;
        position("absolute");
        left(0);
        right(0);
        top(header_height + 245);
        bottom(0);
        overflow_y("scroll");
        padding(10);
        background("white");
        z_index("1");
        onecup.post_render(function() {
          return onecup.lookup("#chat-pushlist").scrollTop = 100000;
        });
        if (channel.recent_pushes) {
          pb.pushbox.width_mainbar = window.innerWidth;
          pushes = channel.recent_pushes;
          pushes.sort(function(a, b) {
            return a.created - b.created;
          });
          results = [];
          for (j = 0, len = pushes.length; j < len; j++) {
            push = pushes[j];
            push.channel_tag = channel.tag;
            push.no_x = true;
            results.push(draw_push(push));
          }
          return results;
        } else {
          padding(30);
          return div(function() {
            width("100%");
            height("100%");
            border("2px dashed " + colors.gray2);
            text_align("center");
            line_height(355);
            color(colors.gray2);
            font_size(18);
            return text("Nothing posted yet");
          });
        }
      });
    });
  };

  views.channel_popup_desktop = function() {
    var channel;
    pb.in_popup = true;
    channel = pb.api.channels.info(onecup.params.tag);
    if (onecup.params.auto === "follow") {
      track("subscribe", {
        channel_tag: channel.tag
      });
      pb.api.subscriptions.subscribe(channel);
      goto(mk_url("/channel-popup", {
        tag: channel.tag
      }));
    }
    return div(function() {
      var header_height;
      header_height = 56;
      div(function() {
        position("absolute");
        background(colors.green1);
        top(0);
        left(0);
        right(0);
        height(header_height);
        box_shadow("0 0 4px rgba(0,0,0,.14),0 4px 8px rgba(0,0,0,.28)");
        z_index("4");
        text_align("center");
        line_height(56);
        color("white");
        font_size(18);
        text("Follow this channel to get notified when new things are posted.");
        div(".pointer", function() {
          position("absolute");
          top(10);
          left(10);
          img({
            src: "/img/channelpopup/logo.png",
            height: 32,
            width: 32
          });
          return onclick(function() {
            return open("https://www.pushbullet.com/");
          });
        });
        return div(".pointer", function() {
          position("absolute");
          top(10);
          right(10);
          img({
            src: "/img/channelpopup/help.png",
            height: 32,
            width: 32
          });
          return onclick(function() {
            return open("https://help.pushbullet.com/articles/what-are-pushbullet-channels/");
          });
        });
      });
      div(function() {
        position("absolute");
        top(header_height);
        left(0);
        bottom(0);
        width(228);
        padding(20);
        background(colors.gray1);
        draw_channel(channel);
        return z_index("1");
      });
      return div("#chat-pushlist", function() {
        var j, len, push, pushes, results;
        position("absolute");
        left(228);
        right(0);
        top(header_height);
        bottom(0);
        overflow_y("scroll");
        padding(10);
        background("white");
        box_shadow("0 0 4px rgba(0,0,0,.14),0 4px 8px rgba(0,0,0,.28)");
        z_index("2");
        onecup.post_render(function() {
          var ref;
          return (ref = onecup.lookup("#chat-pushlist")) != null ? ref.scrollTop = 100000 : void 0;
        });
        if (channel.recent_pushes) {
          pb.pushbox.width_mainbar = window.innerWidth - 228;
          pushes = channel.recent_pushes;
          pushes.sort(function(a, b) {
            return a.created - b.created;
          });
          results = [];
          for (j = 0, len = pushes.length; j < len; j++) {
            push = pushes[j];
            push.channel_tag = channel.tag;
            push.no_x = true;
            results.push(draw_push(push));
          }
          return results;
        } else {
          padding(30);
          return div(function() {
            width("100%");
            height("100%");
            border("2px dashed " + colors.gray2);
            text_align("center");
            line_height(355);
            color(colors.gray2);
            font_size(18);
            return text("Nothing posted yet");
          });
        }
      });
    });
  };

  views.channel_popup = function() {
    if (window.innerWidth < 550) {
      views.channel_popup_mobile();
    } else {
      views.channel_popup_desktop();
    }
    if (pb.api.devices.all.length === 0 && pb.db.get("bootstrap") === "done") {
      return views.your_are_not_done_yet();
    }
  };

  views.your_are_not_done_yet = function() {
    return div(function() {
      position("absolute");
      top(0);
      left(0);
      bottom(0);
      right(0);
      background_color("rgba(0,0,0,.5)");
      z_index("6");
      return div(function() {
        position("absolute");
        top("50%");
        left("50%");
        transform("translate(-50%, -50%)");
        width(350);
        background("white");
        border_radius(5);
        text_align("center");
        padding(20);
        h1(function() {
          return text("You're almost done");
        });
        p(function() {
          text("You need to install Pushbullet");
          br();
          return text("to receive your notifications.");
        });
        return button(".green", function() {
          text("Get Pushbullet");
          return onclick(function() {
            track("channels_get_pushbullet");
            return window.open("https://get.pushbullet.com");
          });
        });
      });
    });
  };

  categories = [
    {
      name: "Featured",
      icon: ".icon-star",
      tags: ["pushbullet", "humblebundle", "androidpoliceapks", "onthehouse", "firstdrive", "channels"]
    }
  ];

  pb.net.get_plain("/config/channels.json", {}, function(data) {
    if (data.error) {
      return console.log("Error Loading Channels.json :", message);
    } else {
      return categories = data;
    }
  });

  views.draw_channel = draw_channel = function(channel) {
    return div(".channel", function() {
      var h, j, len, mychannel, ref, w;
      if (channel.state === "loading") {
        return;
      } else if (channel.state === "error") {
        raw_img(".pic", {
          src: pb.api.channels.default_image_url
        });
        div(".bottom", function() {
          return text("Error loading this channel");
        });
      } else {
        w = CHANNEL_PIC_SIZE * window.devicePixelRatio;
        h = CHANNEL_PIC_SIZE * window.devicePixelRatio;
        raw_img(".pic", {
          src: channel.image_url + ("?w=" + w + "&h=" + h + "&fit=crop")
        });
        ref = pb.api.channels.all;
        for (j = 0, len = ref.length; j < len; j++) {
          mychannel = ref[j];
          if (mychannel.tag === channel.tag) {
            div(".edit.pointer", {
              onclick: (function() {
                return goto(mk_url("/my-channel", {
                  tag: channel.tag
                }));
              })
            }, function() {
              icon(".push-gear");
              return text("edit");
            });
          }
        }
      }
      return div(".bottom", function() {
        var action, pb_subs, subscribe, unsubscribe;
        if (channel.state !== "loaded" && channel.state !== "error") {
          a(".name.pointer", {
            href: mk_url("/channel", {
              tag: channel.tag
            })
          }, function() {
            return text(channel.name);
          });
          if (channel.subscriber_count) {
            div(".count", function() {
              text(Number(channel.subscriber_count).toLocaleString());
              return text(" subscribers");
            });
          }
          div(".description", function() {
            return text(channel.description);
          });
          div(".fade");
        }
        if (!pb.account) {
          action = function() {
            var child, url;
            if (pb.in_frame) {
              url = mk_url("/subscribe", {
                channel_tag: channel.tag
              });
              return child = window.open(url, "pushbulletjs-oauth", "width=550, height=600");
            } else if (pb.in_popup) {
              return goto(mk_url("/signin", {
                next: mk_url("/channel-popup", {
                  tag: channel.tag,
                  auto: "follow"
                })
              }));
            } else {
              return goto(mk_url("/signin", {
                next: mk_url("/channel", {
                  tag: channel.tag
                })
              }));
            }
          };
          return div(".tag.pointer", {
            onclick: action
          }, function() {
            return text("FOLLOW");
          });
        } else {
          pb_subs = pb.api.subscriptions;
          subscribe = function() {
            track("subscribe", {
              channel_tag: channel.tag
            });
            return pb_subs.subscribe(channel);
          };
          unsubscribe = function() {
            track("unsubscribe", {
              channel_tag: channel.tag
            });
            return pb_subs.unsubscribe(channel);
          };
          if (pb_subs.is_subscribed(channel)) {
            return div(".tag.pointer.selected", {
              onclick: unsubscribe
            }, function() {
              return text("FOLLOWING");
            });
          } else if (pb_subs.creating && pb_subs.creating_obj.channel_tag === channel.tag) {
            return div(".tag", function() {
              icon(".icon-spinner.icon-spin");
              return text("FOLLOWING");
            });
          } else {
            return div(".tag.pointer", {
              onclick: subscribe
            }, function() {
              return text("FOLLOW");
            });
          }
        }
      });
    });
  };

  draw_category_card = function(category) {
    return div(".channel", (function(_this) {
      return function() {
        var h, w;
        w = CHANNEL_PIC_SIZE * window.devicePixelRatio;
        h = CHANNEL_PIC_SIZE * window.devicePixelRatio;
        raw_img(".pic", {
          src: mk_url(category.image_url, {
            w: w,
            h: h,
            fit: "crop"
          })
        });
        return div(".bottom", function() {
          var click;
          div(".name", function() {
            return text(category.name);
          });
          div(".description", function() {
            return text(category.description);
          });
          div(".fade");
          click = (function(_this) {
            return function() {
              return goto(mk_url("/channels", {
                category: category.name
              }));
            };
          })(this);
          return div(".tag.pointer", {
            onclick: click
          }, function() {
            text(category.button);
            nbsp(2);
            return icon(".icon-arrow-right");
          });
        });
      };
    })(this));
  };

  draw_category = function(category) {
    return div(".area", function() {
      var category_name, i, j, k, len, len1, ref, ref1, results, sub_category, tag;
      h2(function() {
        icon(category.icon);
        return text(category.name);
      });
      if (category.categories) {
        ref = category.categories;
        for (i = j = 0, len = ref.length; j < len; i = ++j) {
          category_name = ref[i];
          sub_category = find_category(category_name);
          div(function() {
            float("left");
            margin(10);
            width(190);
            if (i % 4 === 3) {
              margin_right(0);
            }
            if (i % 4 === 0) {
              margin_left(0);
            }
            return draw_category_card(sub_category);
          });
        }
      }
      if (category.tags) {
        ref1 = category.tags;
        results = [];
        for (i = k = 0, len1 = ref1.length; k < len1; i = ++k) {
          tag = ref1[i];
          results.push(div(function() {
            float("left");
            margin(10);
            width(190);
            if (i % 4 === 3) {
              margin_right(0);
            }
            if (i % 4 === 0) {
              margin_left(0);
            }
            return draw_channel(pb.api.channels.info(tag));
          }));
        }
        return results;
      }
    });
  };

  find_category = function(name) {
    var category, j, len;
    for (j = 0, len = categories.length; j < len; j++) {
      category = categories[j];
      if (category.name === name) {
        return category;
      }
    }
  };

  views.channels = function() {
    with_view("channels." + onecup.params.category, {
      enter: function() {
        return onecup.scroll_top();
      }
    });
    return div("#channels-page.page", function() {
      return div(".inner", function() {
        padding("1px 70px");
        if (!onecup.params.category) {
          div(".page-header", function() {
            img(".anim.a1", {
              src: "/img/channels/channelHeader01.png",
              width: "608px",
              height: "120px"
            });
            img(".anim.a2", {
              src: "/img/channels/channelHeader02.png",
              width: "608px",
              height: "120px"
            });
            img(".anim.a3", {
              src: "/img/channels/channelHeader03.png",
              width: "608px",
              height: "120px"
            });
            p(function() {
              margin(0);
              b(function() {
                return text("Channels");
              });
              return text(" are notification feeds that can be subscribed to.");
            });
            return p(function() {
              margin(0);
              text("Creating your own channels is easy. ");
              return a({
                href: "/my-channel"
              }, function() {
                return text("Click here to learn more.");
              });
            });
          });
        }
        return div(".channels", function() {
          var category, j, len, results;
          if (onecup.params.tags) {
            return div(".area", function() {
              var j, len, ref, results, tag;
              ref = onecup.params.tags.split(",");
              results = [];
              for (j = 0, len = ref.length; j < len; j++) {
                tag = ref[j];
                results.push(draw_channel(pb.api.channels.info(tag)));
              }
              return results;
            });
          } else if (onecup.params.category) {
            category = find_category(onecup.params.category);
            return draw_category(category);
          } else {
            results = [];
            for (j = 0, len = categories.length; j < len; j++) {
              category = categories[j];
              if (!category.child) {
                results.push(draw_category(category));
              } else {
                results.push(void 0);
              }
            }
            return results;
          }
        });
      });
    });
  };

  channel_categories = function() {
    div(".area", function() {
      var cls, select;
      cls = "";
      if (!onecup.params.category) {
        cls = ".selected";
      }
      select = function() {
        return goto("/channels");
      };
      return div("#everything.item.header.pointer" + cls, {
        onclick: select
      }, function() {
        div(".device-pic", function() {
          return icon(".push-everything");
        });
        return div(".words", function() {
          return div(".one-line", function() {
            return text("Everything");
          });
        });
      });
    });
    return div(".area", function() {
      var category, j, len, results;
      results = [];
      for (j = 0, len = categories.length; j < len; j++) {
        category = categories[j];
        if (category.child) {
          continue;
        }
        results.push((function(category) {
          var click, cls;
          click = function() {
            return goto(mk_url("/channels", {
              category: category.name
            }));
          };
          cls = "";
          if (category.name === onecup.params.category) {
            cls = ".selected";
          }
          return div(".item.pointer" + cls, {
            onclick: click
          }, function() {
            div(".device-pic.smaller", function() {
              return icon(category.icon);
            });
            return div(".words", function() {
              return div(".one-line", function() {
                return text(category.name);
              });
            });
          });
        })(category));
      }
      return results;
    });
  };

  views.new_channel = function() {
    return div(function() {
      padding_top(60);
      text_align("center");
      h2(function() {
        return text("What are Pushbullet Channels?");
      });
      p(function() {
        max_width(500);
        margin("0px auto");
        return text("Channels are notification feeds that you can follow. They’re a great way of getting notified when things happen around the web. Here are 3 great examples:");
      });
      div(function() {
        margin(40);
        raw('<iframe scrolling="no" frameborder="0" allowtransparency="true" src="https://widget.pushbullet.com/widget.html#channel=xkcd&amp;code=1405&amp;widget=card" style="height: 360px; width: 190px;"></iframe>');
        nbsp(4);
        raw('<iframe scrolling="no" frameborder="0" allowtransparency="true" src="https://widget.pushbullet.com/widget.html#channel=onthehouse&amp;code=1405&amp;widget=card" style="height: 360px; width: 190px;"></iframe>');
        nbsp(4);
        return raw('<iframe scrolling="no" frameborder="0" allowtransparency="true" src="https://widget.pushbullet.com/widget.html#channel=googleacquisitions&amp;code=1405&amp;widget=card" style="height: 360px; width: 190px;"></iframe>');
      });
      return button(".green", function() {
        onclick(function() {
          return goto("/channels");
        });
        return text("Browse more channels");
      });
    });
  };

}).call(this);

//# sourceMappingURL=channels.js.map

// from 'src/views/clients.js'
// Generated by CoffeeScript 1.10.0
(function() {
  eval(onecup["import"]());

  pb.clients = {};

  views.create_client = function() {
    return inner(".page", function() {
      return h1(function() {
        return text("Create a client");
      });
    });
  };

  views.edit_clients = function() {
    h1(function() {
      return text("OAuth Clients");
    });
    text("OAuth clients enable you to develop apps powered by Pushbullet. ");
    a({
      href: "https://docs.pushbullet.com/#oauth"
    }, function() {
      return text("See here for more details");
    });
    text(".");
    return crud.complex(pb.api.clients, ["name", "website_url", "image_url", "redirect_uri", "client_id", "client_secret", "allowed_origin"], ["name", "website_url", "image_url", "redirect_uri", "allowed_origin"], function(object) {
      return div(function() {
        var params, url;
        padding(10);
        background_color(colors.gray1);
        params = {
          client_id: object.client_id,
          redirect_uri: object.redirect_uri,
          response_type: "token",
          scope: "everything"
        };
        url = mk_url(location.protocol + "//" + location.host + "/authorize", params);
        text("oauth test url: ");
        return a({
          href: url
        }, function() {
          return text("click here");
        });
      });
    });
  };

}).call(this);

// from 'src/views/index.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var get_apps_table, inner, login_area, mast_head_new, mast_head_old, mast_video;

  eval(onecup["import"]());

  css(".track .image-hover", function() {
    return opacity("0");
  });

  css(".track:hover .image-hover", function() {
    return opacity("1");
  });

  mast_video = function(vid, h) {
    return video({
      autoplay: true,
      loop: true
    }, function() {
      position("absolute");
      right(0);
      height(h);
      background_image("url(/img/masthead/vid/" + vid + ".jpg)");
      background_size("cover");
      background_position("50% 50%");
      source({
        src: "/img/masthead/vid/" + vid + ".mp4",
        type: "video/mp4"
      });
      return source({
        src: "/img/masthead/vid/" + vid + ".webm",
        type: "video/webm"
      });
    });
  };

  mast_head_old = function() {
    var brand_words;
    brand_words = function() {
      return h1(function() {
        margin_bottom(60);
        font_weight("bold");
        text_align("center");
        font_weight("normal");
        line_height(40);
        font_size(30);
        color(colors.gray4);
        return text("Pushbullet connects your devices, making them feel like one.");
      });
    };
    if (window.innerWidth > 520) {
      height(430);
      img(".bigimage", {
        src: "/img/landingpage/frontImage.png",
        width: 550,
        height: 340
      }, function() {
        position("absolute");
        top(50);
        return right(340);
      });
      return div(".header-side", function() {
        position("absolute");
        top(40);
        right(34);
        width(320);
        brand_words();
        return login_area();
      });
    } else {
      height(330);
      return div(function() {
        position("relative");
        width(320);
        margin("30px auto");
        brand_words();
        return login_area();
      });
    }
  };

  mast_head_new = function() {
    var brand_words, center_it, mast_height, vid;
    center_it = false;
    vid = "Productive-Morning";
    mast_height = 540;
    height(mast_height);
    brand_words = function() {
      return h1(function() {
        margin_top(0);
        margin_bottom(40);
        font_weight("bold");
        text_align("center");
        font_weight("normal");
        line_height(40);
        font_size(30);
        text("Pushbullet bridges");
        br();
        text("the gap between");
        br();
        return text("your devices");
      });
    };
    if (window.innerWidth > 520) {
      div(function() {
        position("absolute");
        top(0);
        right(0);
        width("100%");
        height(mast_height);
        overflow("hidden");
        if (vid) {
          mast_video(vid, mast_height);
          return div(function() {
            position("absolute");
            top(0);
            right(0);
            left(0);
            bottom(0);
            if (vid === "Typing") {
              return background_color("rgba(0,0,0,.45)");
            } else {
              return background_color("rgba(0,0,0,.35)");
            }
          });
        } else {
          return img({
            src: img_url,
            width: 960,
            height: mast_height
          }, function() {
            position("absolute");
            top(0);
            return right(0);
          });
        }
      });
      if (center_it) {
        return div(function() {
          position("absolute");
          width("100%");
          top(70);
          return div(function() {
            position("relative");
            width(320);
            margin("0px auto");
            color("white");
            brand_words();
            return login_area();
          });
        });
      } else {
        return div(function() {
          position("absolute");
          top(40);
          right(30);
          width(320);
          color("white");
          brand_words();
          return login_area();
        });
      }
    } else {
      height(330);
      return div(function() {
        position("relative");
        width(320);
        padding_top(20);
        margin("30px auto");
        div(function() {
          color(colors.gray4);
          return brand_words();
        });
        return login_area();
      });
    }
  };

  login_area = function() {
    return div(function() {
      var url;
      position("relative");
      url = "/";
      button(".btn.google-button", function() {
        position("absolute");
        top(0);
        right(30);
        onclick(function() {
          track("main_login", {
            type: "google"
          });
          return window.location = pb.google_token_url(url);
        });
        return img(".store", {
          src: "/img/landingpage/google.png",
          width: "261px",
          height: "47px",
          alt: "Sign up with Google"
        });
      });
      return button(".btn.facebook-button", function() {
        position("absolute");
        top(70);
        right(30);
        onclick(function() {
          track("main_login", {
            type: "facebook"
          });
          return window.location = pb.facebook_token_url(url);
        });
        return img(".store", {
          src: "/img/landingpage/facebook.png",
          width: "261px",
          height: "47px",
          alt: "Sign up with Facebook"
        });
      });
    });
  };

  views.landing_page = function() {
    var app, area;
    with_view("landing_page", {
      enter: function() {
        return onecup.scroll_top();
      }
    });
    area = function(s) {
      return div(".area", function() {
        position("relative");
        height(260);
        margin(40);
        img({
          src: s.img,
          width: "420px",
          height: "250px"
        }, function() {
          if (s.side === 'right') {
            return float("right");
          }
        });
        return div(function() {
          position("absolute");
          top(20);
          right(0);
          width(340);
          if (s.side === 'right') {
            left(0);
          }
          h2(function() {
            font_weight("normal");
            return text(s.title);
          });
          return p(function() {
            margin_top(10);
            font_size(17);
            line_height(24);
            color(colors.gray2);
            return text(s.message);
          });
        });
      });
    };
    app = function(type, name, small_text, url) {
      if (!url) {
        url = pb.URLS[type];
      }
      return a(".app-icon", {
        href: url,
        target: "_blank"
      }, function() {
        display("inline-block");
        padding("20px 0px");
        margin("0px 0px");
        height(160);
        width(120);
        font_size(18);
        color(colors.gray4);
        text_decoration("none");
        text_align("center");
        img(".image", {
          src: "/img/apps/app-" + type + ".png",
          height: "80px",
          width: "80px"
        }, function() {
          return margin("0px 20px 10px 20px");
        });
        text(name);
        if (small_text) {
          div(".small", function() {
            color(colors.gray2);
            font_size(16);
            return text(small_text);
          });
        }
        return {
          onclick: function() {
            return track("app_link", {
              app: type,
              text: name
            });
          }
        };
      });
    };
    return div("#landing-page.fadein", function() {
      background_color(colors.white1);
      return div(".inner", function() {
        var track_icon;
        overflow("hidden");
        background("white");
        box_shadow("0 0 8px rgba(0,0,0,.06),0 4px 16px rgba(0,0,0,.12)");
        width("100%");
        max_width(960);
        div(".header", function() {
          position("relative");
          return mast_head_old();
        });
        div(".apps", function() {
          padding(20);
          text_align("center");
          margin_bottom(70);
          app("android", "Android");
          app("ios", "iOS");
          if (window.innerWidth < 500) {
            br();
          }
          app("chrome", "Chrome");
          app("firefox", "Firefox");
          if (window.innerWidth < 950) {
            br();
          }
          app("safari", "Safari");
          app("opera", "Opera");
          if (window.innerWidth < 500) {
            br();
          }
          return app("windows", "Windows");
        });
        track_icon = function(type, url, title, body, extra) {
          return div(".track.pointer", function() {
            display("inline-block");
            width(280);
            margin("0px 10px");
            height(380);
            text_align("center");
            vertical_align("top");
            onclick(function() {
              track("track_icon", {
                app: type,
                text: text
              });
              return window.location = url;
            });
            div(".track-image", function() {
              width(170);
              margin("auto");
              position("relative");
              height(170);
              img(".image", {
                src: "/img/landingpage/" + type + ".png",
                height: "170px",
                width: "170px"
              }, function() {
                position("absolute");
                return left(0);
              });
              img(".image-hover", {
                src: "/img/landingpage/hover/" + type + ".png",
                height: "170px",
                width: "170px"
              }, function() {
                position("absolute");
                return left(0);
              });
              if (extra) {
                return div(".image-hover", function() {
                  position("absolute");
                  bottom(0);
                  width(170);
                  padding(5);
                  background_color(colors.gray4);
                  border_radius(5);
                  color("white");
                  return text(extra);
                });
              }
            });
            return div(".text", function() {
              margin_top(10);
              color(colors.gray3);
              div(function() {
                color(colors.gray4);
                font_size(18);
                font_weight("bold");
                text(title);
                return margin_bottom(10);
              });
              return div(function() {
                color(colors.gray3);
                font_size(16);
                return text(body);
              });
            });
          });
        };
        div(".tracks", function() {
          overflow("hidden");
          text_align("center");
          track_icon("SMS", "https://help.pushbullet.com/articles/how-do-i-send-text-messages-from-my-computer/", "Send text messages", "Typing on a keyboard is so much faster than typing on a phone. Easily send and receive texts on your computer.", "Android only");
          track_icon("notifications", "https://help.pushbullet.com/articles/how-do-i-see-my-phones-notifications-on-my-computer/", "See your phone's notifications", "Never miss a call or a text again while working at your computer. Pushbullet shows you WhatsApp messages, texts, phone calls, and more.", "iPhone only works with Mac, Android works with any Computer");
          track_icon("channels", "https://help.pushbullet.com/articles/what-are-pushbullet-channels/", "Follow interesting things", "Get notified about things you care about. A new xkcd post, new free games from EA, Google acquisitions, and more.");
          track_icon("links", "https://help.pushbullet.com/articles/how-do-i-send-links-with-pushbullet/", "Send links", "Instantly share links between any of your devices. Never email yourself a link again just to get it somewhere else.");
          track_icon("chat", "https://help.pushbullet.com/articles/how-do-i-share-and-chat-with-friends/", "Chat with friends", "Pushbullet works great on all of your devices, which makes sharing and chatting with friends more convenient than ever.");
          return track_icon("files", "https://help.pushbullet.com/articles/how-do-i-send-files-with-pushbullet/", "Send files", "Moving pictures and files between your devices has never been easier. Files download automatically and can be opened right from the notifications.");
        });
        return div(function() {
          var newsicon;
          padding(20);
          position("relative");
          text_align("center");
          newsicon = function(w, y, image, url) {
            return a(".hover-fade", {
              href: url
            }, function() {
              display("inline-block");
              margin("0px 10px");
              return img({
                src: "/img/famous/" + image + ".png",
                width: w,
                heigth: 70
              });
            });
          };
          newsicon(150, 20, "wired", "http://www.wired.com/2014/07/pushbullet-notifications/");
          newsicon(80, 224, "androidpolice", "http://www.androidpolice.com/2014/10/28/pushbullet-gets-a-huge-update-with-material-inspired-makeover-new-filtering-options-and-more/");
          newsicon(170, 327, "gizmodo", "http://gizmodo.com/pushbullet-is-a-fantastic-app-every-phone-should-have-1681813257");
          if (window.innerWidth < 750) {
            br();
          }
          newsicon(110, 521, "techCrunch", "http://techcrunch.com/2015/01/27/pushbullet-can-now-send-ios-notifications-to-your-mac-raises-1-5m/");
          newsicon(130, 659, "cbs", "http://www.cbsnews.com/news/pushbullet-makes-your-pc-an-extension-of-your-smartphone/");
          return newsicon(74, 819, "macrumors", "http://www.macrumors.com/2015/01/28/pushbullet-ios-mac-safari-review/");
        });
      });
    });
  };

  views.apps_page = function() {
    return inner(".get-apps", function() {
      padding_bottom(100);
      return get_apps_table();
    });
  };

  inner = function(def, fn) {
    return div(def, function() {
      return div(".inner", fn);
    });
  };

  get_apps_table = function() {
    var app_link, pop;
    h1(function() {
      return text("Get Pushbullet:");
    });
    pop = function(type, text) {
      return function() {
        return track("app_link", {
          app: type,
          text: text
        });
      };
    };
    app_link = function(type, name, small_text, url) {
      if (!url) {
        url = pb.URLS[type];
      }
      return a(".item", {
        href: url,
        target: "_blank",
        onclick: pop(type, small_text)
      }, function() {
        img(".image", {
          src: "/img/apps/app-" + type + ".png",
          height: "80px"
        });
        text(name);
        return div(".small", function() {
          return text(small_text);
        });
      });
    };
    div(".apps-area", function() {
      padding_left(193);
      app_link("android", "Android");
      return app_link("ios", "iPhone");
    });
    div(".apps-area", function() {
      padding_left(110);
      app_link("chrome", "Chrome");
      app_link("firefox", "Firefox");
      return app_link("opera", "Opera");
    });
    div(".apps-area", function() {
      padding_left(295);
      return app_link("windows", "Windows");
    });
    h3(function() {
      return text("Apps made by our amazing community.");
    });
    h4(function() {
      return text("Contact the independent developers for support.");
    });
    div(".apps-area", function() {
      padding_left(190);
      padding_bottom(30);
      app_link("mac", "Noti", "Mac", "https://noti.center/");
      return app_link("mac", "PushPal", "Mac", "http://pushpal.arjones.com/pushpal.html");
    });
    div(".apps-area", function() {
      padding_left(110);
      padding_bottom(30);
      app_link("winphone", "Instabullet", "Unversal", "https://www.microsoft.com/en-us/store/apps/instabullet/9nblgggzm9c3#app-details");
      app_link("winphone", "PushPin ", "Phone", "http://www.windowsphone.com/en-us/store/app/pushpin/b6764b31-9f2a-4ba4-9e00-aba343928459");
      return app_link("winphone", "Pushile", "Phone", "http://www.windowsphone.com/en-us/store/app/pushile/c72b5765-58ad-4952-b7f9-6fbdfdad677a");
    });
    div(".apps-area", function() {
      padding_left(190);
      padding_bottom(30);
      app_link("blackberry", "BlackBullet", "BlackBerry", "http://appworld.blackberry.com/webstore/content/58534486/?countrycode=US&lang=en");
      return app_link("blackberry", "PushPlane", "BlackBerry", "http://appworld.blackberry.com/webstore/content/59938185/?countrycode=US&lang=en");
    });
    return div(".apps-area", function() {
      padding_left(272);
      padding_bottom(30);
      return app_link("ubuntu", "PB Indicator ", "Ubuntu", "http://www.atareao.es/tag/pushbullet-indicator/");
    });
  };

}).call(this);

// from 'src/views/oauth.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var big_oauth, pb_auth, pb_deny, pb_login, view_grant;

  eval(onecup["import"]());

  pb.oauth = {};

  pb_auth = function() {
    var parts;
    parts = pb.db.get_simple("oauth_parts");
    if (!parts) {
      parts = onecup.params;
    }
    pb.oauth.authorizing = true;
    return pb.pb_oauth(parts, function(r) {
      var data, ref;
      pb.oauth.authorizing = false;
      if (r.error) {
        return pb.oauth.error = r.error;
      } else if (r.redirect_uri) {
        return window.location = r.redirect_uri;
      } else {
        if (window.opener != null) {
          data = {
            client_id: parts.client_id,
            code: r.code
          };
          if ((ref = window.opener) != null) {
            ref.postMessage(data, "*");
          }
        }
        return goto("/oauth-apps");
      }
    });
  };

  pb_deny = function() {
    var data, parts;
    parts = onecup.params;
    if (parts.redirect_uri) {
      return window.location = parts.redirect_uri + "?error=access_denied";
    } else if (window.opener != null) {
      data = {
        client_id: parts.client_id
      };
      return window.opener.postMessage(data, "*");
    }
  };

  pb_login = function() {
    window.onbeforeunload = function() {};
    return window.location = pb.google_token_url('/authorize');
  };

  window.pb_oauth_page = function() {
    var parts;
    parts = onecup.params;
    if (!parts.client_id) {
      parts = pb.db.get_simple("oauth_parts");
    } else {
      pb.db.set_simple("oauth_parts", parts);
    }
    return big_oauth(parts);
  };

  views.aouth_header = function() {
    return div("#header", function() {
      position("relative");
      min_width(440);
      margin_bottom(0);
      img("#logo", {
        src: "/img/header/logo.png",
        height: "58px",
        width: "306px"
      }, function() {
        position("absolute");
        top(15);
        return left(15);
      });
      return div("#account-btn", function() {
        var ref;
        position("absolute");
        top(15);
        right(15);
        if (((ref = pb.account) != null ? ref.image_url : void 0) != null) {
          return background_image("url('" + pb.account.image_url + "')");
        } else {
          return i(".push-friend");
        }
      });
    });
  };

  big_oauth = function(parts) {
    return div(".agree-page", function() {
      var client;
      text_align("center");
      views.aouth_header();
      if (!parts || !parts.client_id) {
        h1(function() {
          padding("130px 0px");
          color(colors.red);
          return text("Error: no client_id in url or localStorage (are cookies disabled?)");
        });
        return;
      }
      client = pb.api.clients.info(parts.client_id);

      /* wtf???
      window.onbeforeunload = ->
          data =
              client_id:parts.client_id
          window.opener?.postMessage(data, "*")
       */
      div(function() {
        if (client.state === "error") {
          h1(function() {
            padding("130px 0px");
            color(colors.red);
            text("Error loading client with id:");
            return div(function() {
              return text(parts.client_id);
            });
          });
          return;
        }
        if (client.state === "loading") {
          div(function() {
            padding("130px 0px");
            font_size(30);
            icon(".icon-spinner.icon-spin");
            return text("Loading...");
          });
        }
      });
      if (client.image_url) {
        div(".client-image", function() {
          padding(0);
          margin_top(10);
          return img({
            src: client.image_url,
            width: 200,
            height: 200
          }, function() {
            return margin("40px 20px 0px 20px");
          });
        });
      }
      h1(function() {
        margin(10);
        return text(client.name);
      });
      p(function() {
        width(400);
        margin("15px auto 20px auto");
        line_height(34);
        font_size(22);
        if (parts.scope === "push") {
          text("Let ");
          text(client.name);
          return text(" send you push notifications?");
        } else {
          text("Grant ");
          strong(function() {
            return a({
              href: client.website_url
            }, function() {
              return text(client.website_url);
            });
          });
          return text(" access to your Pushbullet profile and data.");
        }
      });
      if (pb.oauth.error) {
        div(function() {
          color("red");
          return text(pb.oauth.error);
        });
      }
      if (pb.account) {
        p(function() {
          return button(".btn.green.approve", {
            onclick: pb_auth
          }, function() {
            width(230);
            height(60);
            font_size(20);
            margin_bottom(30);
            if (pb.oauth.authorizing) {
              icon(".icon-spinner.icon-spin");
              return text("Approving");
            } else {
              return text("Approve");
            }
          });
        });
      } else {
        views.signin_buttons(window.location.toString());
      }
      return p(function() {
        margin_top(20);
        return a(".deny", {
          onclick: pb_deny
        }, function() {
          font_size(35);
          color(colors.red);
          return text("Deny");
        });
      });
    });
  };

  window.view_oauth_grants = function() {
    h2(function() {
      return text("OAuth Grants");
    });
    if (!pb.api.grants.have_fetched) {
      if (pb.api.grants.getting) {
        icon(".icon-spinner.icon-spin");
        text("Loading...");
      } else {
        pb.api.grants.get();
      }
      return;
    }
    return div(".grants", function() {
      var grant, j, len, ref, results;
      ref = pb.api.grants.all;
      results = [];
      for (j = 0, len = ref.length; j < len; j++) {
        grant = ref[j];
        results.push(view_grant(grant));
      }
      return results;
    });
  };

  view_grant = function(grant) {
    if (!grant.active) {
      return;
    }
    return div(".grant", function() {
      img(".image", {
        src: grant.client.image_url
      });
      div(".name", function() {
        return text(grant.client.name);
      });
      div(".url", function() {
        return a({
          href: grant.client.website_url
        }, function() {
          return text(grant.client.website_url);
        });
      });
      return div(".buttons", function() {
        if (pb.api.grants.deleting === grant.iden) {
          return button(".btn", function() {
            icon(".icon-spinner.icon-spin");
            return text("Deleting...");
          });
        } else if (pb.api.grants.delete_check === grant.iden) {
          button(".btn", {
            onclick: function() {
              return pb.api.grants.delete_check = null;
            }
          }, function() {
            return text("Cancel");
          });
          return button(".btn.red", {
            onclick: function() {
              return pb.api.grants["delete"](grant);
            }
          }, function() {
            return text("Delete");
          });
        } else {
          return button(".btn.red", function() {
            onclick(function() {
              return pb.api.grants.delete_check = grant.iden;
            });
            return text("Delete");
          });
        }
      });
    });
  };

  views.login_success = function() {
    return div(function() {
      margin(100);
      text_align("center");
      h1(function() {
        return text("Success");
      });
      return div(function() {
        color("red");
        return text("SECURITY WARNING: Please treat the URL above as you would your password and do not share it with anyone.");
      });
    });
  };

  views.oauth_apps = function() {
    return div(".agree-page", function() {
      var app;
      text_align("center");
      window.onbeforeunload = function() {};
      views.aouth_header();
      div(function() {
        margin_top(40);
        color(color.gray2);
        return h1(function() {
          return text("Approved!");
        });
      });
      h1(function() {
        width(360);
        font_size(25);
        margin("52px auto 23px auto");
        color(colors.green1);
        return text("Get Pushbullet to receive notifications:");
      });
      p(".apps-label", function() {
        font_weight("bold");
        margin("2px auto 2px auto");
        return text("browser extentions");
      });
      app = function(type) {
        return a({
          href: pb.URLS[type]
        }, function() {
          display("inline-block");
          margin("5px 10px 10px 10px");
          return img({
            src: "/img/oauth/" + type + ".png",
            width: "50px",
            height: "50px"
          });
        });
      };
      app("chrome");
      app("firefox");
      p(".apps-label", function() {
        font_weight("bold");
        margin("2px auto 2px auto");
        return text("mobile and desktop apps");
      });
      app("ios");
      app("android");
      return app("windows");
    });
  };

}).call(this);

//# sourceMappingURL=oauth.js.map

// from 'src/views/desktop_auth.js'
// Generated by CoffeeScript 1.10.0
(function() {
  eval(onecup["import"]());

  pb.parse_auth_fragment = function() {
    var kargs, params, source, state;
    if (window.location == null) {
      return;
    }
    params = onecup.parse_query_string(window.location.hash.slice(1));
    if (params.access_token) {
      state = pb.db.get_simple(params.state);
      pb.db.del_simple(params.state);
      if (!state || !state.type) {
        console.log("Have params.access_token but no state");
        goto("/auth_error?reason=localstorage");
        return;
      }
      track("access_token", {
        access_token: params.access_token
      });
      pb.db.set("access_token", params.access_token);
      pb.logging_in = true;
      if (state.method === "add") {
        return pb.net.post("/v2/accounts", {
          access_token: params.access_token,
          type: state.type
        }, function(r) {
          var error, ref, ref1;
          if (r.error) {
            pb.error.banner("Error adding account", (ref = r.error) != null ? ref.message : void 0);
            error = (ref1 = r.error) != null ? ref1.message : void 0;
            track("error_add_account", {
              error: error
            });
            if (error === "Email address missing from account.") {
              goto("/auth_error?reason=email");
            } else if (error === "Another user already owns this account.") {
              goto("/auth_error?reason=another_exists");
            } else {
              goto("/auth_error");
            }
          }
          pb.logging_in = false;
          return window.location = state.redirect_url;
        });
      } else {
        if (pb.account != null) {
          pb.signout(false);
        }
        source = state.source || "web";
        kargs = {
          access_token: params.access_token,
          type: state.type,
          tracking: {
            source: source,
            client_id: pb.client_id,
            session_id: pb.session_id
          }
        };
        return pb.net.post_plain(pb.API_SERVER + "/v2/authenticate", kargs, function(r) {
          var error, ref, ref1;
          pb.logging_in = false;
          if (r.error) {
            pb.error.banner("Error signing in to your account", (ref = r.error) != null ? ref.message : void 0);
            error = (ref1 = r.error) != null ? ref1.message : void 0;
            track("error_signin", {
              error: error
            });
            pb.logging_in = false;
            if (error === "Email address missing from account.") {
              return goto("/auth_error?reason=email");
            } else {
              return goto("/auth_error");
            }
          } else {
            pb.db.set_simple("account", r);
            pb.account = r;
            pb.post_signin_reload();
            window.location = state.redirect_url;
            return track("authenticated");
          }
        });
      }
    }
  };

  views.auth_error = function() {
    return inner(".page.markdown", function() {
      padding(100);
      if (onecup.params.reason === "another_exists") {
        h1(function() {
          return text("Sorry, this account already exists on Pushbullet.");
        });
        p(function() {
          return text("To be able to connect it, you need to delete the account it's already on first.");
        });
        return;
      }
      h1(function() {
        return text("Sorry, something went wrong.");
      });
      if (onecup.params.reason === "email") {
        ul(function() {
          li(function() {
            return p(function() {
              return text("We need an email address and did not get one from your Facebook profile.");
            });
          });
          return li(function() {
            return p(function() {
              text("You can try again ");
              a({
                href: "/signin"
              }, function() {
                return text("here");
              });
              return text(".");
            });
          });
        });
      } else if (onecup.params.reason === "token") {
        goto("/");
      } else if (onecup.params.reason === "localstorage") {
        ul(function() {
          li(function() {
            return p(function() {
              return text("Local Storage seems to be unaccessible to us.");
            });
          });
          li(function() {
            return p(function() {
              return text("Do you have cookies disabled?");
            });
          });
          return li(function() {
            return p(function() {
              return text("Some browser extensions can conflict with our site. Temporarily disable them to test this.");
            });
          });
        });
      } else {
        ul(function() {
          li(function() {
            return p(function() {
              return text("Something seems to be blocking Pushbullet.");
            });
          });
          li(function() {
            return p(function() {
              return text("Office or public firewalls, proxies, and VPNs can cause this.");
            });
          });
          li(function() {
            return p(function() {
              return text("Please disable your browser extensions to see if it fixes the issue");
            });
          });
          return li(function() {
            return p(function() {
              return text("Are other sites besides Pushbullet.com working?");
            });
          });
        });
      }
      return p(function() {
        text("If you still can't log in, send us an email at ");
        a({
          href: "/support"
        }, function() {
          return text("hey@pushbullet.com");
        });
        return text(".");
      });
    });
  };

  pb.google_token_url = function(redirect_url, source, method) {
    var state_iden, url;
    if (redirect_url == null) {
      redirect_url = "/";
    }
    if (source == null) {
      source = "web";
    }
    if (method == null) {
      method = "login";
    }
    state_iden = pb.rand_iden();
    pb.db.set_simple(state_iden, {
      type: "google",
      redirect_url: redirect_url,
      method: method,
      source: source
    });
    url = mk_url("https://accounts.google.com/o/oauth2/auth", {
      state: state_iden,
      scope: ["https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"].join(" "),
      prompt: 'select_account',
      redirect_uri: pb.AUTH_REDIRECT_URI,
      prompt: 'select_account',
      client_id: "336343571939-881tp5n559pij79kmb2irmnbg641qt7c.apps.googleusercontent.com",
      response_type: "token"
    });
    return url;
  };

  pb.facebook_token_url = function(redirect_url, source, method) {
    var state_iden, url;
    if (redirect_url == null) {
      redirect_url = "/";
    }
    if (source == null) {
      source = "web";
    }
    if (method == null) {
      method = "login";
    }
    state_iden = pb.rand_iden();
    pb.db.set_simple(state_iden, {
      type: "facebook",
      redirect_url: redirect_url,
      method: method,
      source: source
    });
    url = mk_url("https://www.facebook.com/dialog/oauth", {
      scope: "email",
      redirect_uri: pb.AUTH_REDIRECT_URI,
      state: state_iden,
      prompt: 'select_account',
      client_id: "1541617089384972",
      response_type: "token",
      auth_type: "rerequest"
    });
    return url;
  };

  views.signing_in_spinner = function() {
    background_color("white");
    return div(function() {
      text_align("center");
      padding_top(100);
      return h1(function() {
        icon(".icon-spinner.icon-spin.icon-large");
        nbsp(5);
        return text("Signing in...");
      });
    });
  };

  views.desktop_auth = function() {
    var platform, source, url;
    platform = onecup.params.platform || "windows";
    source = onecup.params.source || onecup.params.platform || "web";
    if (onecup.params.type === "done") {
      if (!pb.account) {
        return div(function() {
          padding("200px");
          text_align("center");
          font_size(30);
          icon(".icon-spinner.icon-spin.icon-large");
          return text(" You are signing into Pushbullet.");
        });
      } else {
        if (platform === "mac") {
          url = "http://127.0.0.1:20807/auth?api_key=" + pb.account.api_key;
        } else {
          url = "http://localhost:20807/auth?api_key=" + pb.account.api_key;
        }
        return window.location = url;
      }
    } else {
      url = mk_url("/desktop_auth", {
        type: "done",
        platform: platform
      });
      if (onecup.params.type === "google") {
        return window.location = pb.google_token_url(url, source);
      } else if (onecup.params.type === "facebook") {
        return window.location = pb.facebook_token_url(url, source);
      }
    }
  };

  views.pick_signin_type = function() {
    return div(function() {
      margin_top(100);
      text_align("center");
      div(function() {
        margin("60px 0px 50px 0px");
        font_size(30);
        return text("Sign in to Pushbullet");
      });
      return div(function() {
        var source;
        position("relative");
        width(300);
        margin("0px auto");
        source = onecup.params.source || onecup.params.platform || "web";
        return views.signin_buttons(onecup.params.next || "/", source, onecup.params.method);
      });
    });
  };

  views.signin_buttons = function(url, source, method) {
    if (method == null) {
      method = "login";
    }
    button(".btn.google-button", function() {
      onclick(function() {
        track("login", {
          type: "google"
        });
        return window.location = pb.google_token_url(url, source, method);
      });
      return img(".store", {
        src: "/img/oauth/signIn_google.png",
        width: "261px",
        height: "47px",
        alt: "Sign up with Google"
      });
    });
    br();
    br();
    return button(".btn.facebook-button", function() {
      onclick(function() {
        track("login", {
          type: "facebook"
        });
        return window.location = pb.facebook_token_url(url, source, method);
      });
      return img(".store", {
        src: "/img/oauth/signIn_facebook.png",
        width: "261px",
        height: "47px",
        alt: "Sign up with Facebook"
      });
    });
  };

}).call(this);

//# sourceMappingURL=desktop_auth.js.map

// from 'src/views/widget.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var parse_hash, resize_iframe, subscribed;

  eval(onecup["import"]());

  pb.widget = {};

  parse_hash = function() {
    var args, j, k, len, pair, params, ref, ref1, v;
    params = location.hash.slice(1);
    args = {};
    ref = params.split("&");
    for (j = 0, len = ref.length; j < len; j++) {
      pair = ref[j];
      if (!pair) {
        continue;
      }
      ref1 = pair.split("="), k = ref1[0], v = ref1[1];
      args[k] = unescape(decodeURI(v.replace(/\+/g, " ")));
    }
    return args;
  };

  resize_iframe = function(params) {
    var height, widget, width;
    widget = document.getElementById("widget");
    if (!widget) {
      widget = document.getElementsByClassName("channel")[0];
    }
    if (!widget) {
      return;
    }
    height = widget.offsetHeight;
    width = widget.offsetWidth;
    if (pb.widget.height !== height || pb.widget.width !== width) {
      pb.widget.width = width;
      pb.widget.height = height;
      console.log("size", width, "x", height);
      return window.parent.postMessage(JSON.stringify({
        'code': params['code'],
        'height': height,
        'width': width
      }), '*');
    }
  };

  views.widget = function() {
    var action, channel, cls, params, pb_subs, subscribed;
    params = parse_hash();
    with_view("button", {
      enter: function() {
        return pb.in_frame = true;
      }
    });
    channel = pb.api.channels.info(params.channel);
    if (channel.state === "loading" || channel.state === "error") {
      return;
    }
    setTimeout((function() {
      return resize_iframe(params);
    }), 1);
    if (params.widget === "card") {
      views.draw_channel(channel);
      return;
    }
    subscribed = false;
    cls = "";
    if (pb.account) {
      pb_subs = pb.api.subscriptions;
      if (!pb_subs.deleting && pb_subs.is_subscribed(channel) || pb_subs.creating) {
        cls += ".subscribed";
        subscribed = true;
      }
      action = function() {
        if (pb_subs.is_subscribed(channel)) {
          return pb_subs.unsubscribe(channel);
        } else {
          return pb_subs.subscribe(channel);
        }
      };
    } else {
      action = function() {
        var child, url;
        url = "/subscribe?scope=push&response_type=code&channel_tag=" + params.channel;
        return child = window.open(url, "pushbulletjs-oauth", "width=550, height=600");
      };
    }
    if (params['size']) {
      cls += "." + params['size'];
    }
    return div("#widget" + cls, {
      onclick: action
    }, function() {
      i();
      return span("#label", function() {
        if (subscribed) {
          text("Subscribed to ");
        } else {
          text("Subscribe to ");
        }
        return span("#channel", function() {
          return text(channel.name || params.channel);
        });
      });
    });
  };

  subscribed = false;

  views.channel_auth = function() {
    var channel;
    with_view("button", {
      enter: function() {
        return subscribed = false;
      }
    });
    channel = pb.api.channels.info(onecup.params.channel_tag);
    return div(function() {
      views.aouth_header();
      return div(function() {
        var method, pb_subs, subscribe, unsubscribe;
        margin_top(20);
        text_align("center");
        if (!channel || channel.state === "loading") {
          div(function() {
            margin_top(200);
            font_size(20);
            icon(".icon-spinner.icon-spin");
            return text("Loading...");
          });
          return;
        }
        if (channel.state === "error") {
          h2(function() {
            return text("Sorry, this channel does not exist.");
          });
          return;
        }
        if (channel.image_url) {
          div(".image", function() {
            return raw_img({
              src: channel.image_url,
              width: 200,
              height: 200
            });
          });
        }
        h2(function() {
          return text(channel.name);
        });
        p(function() {
          margin_bottom(30);
          return text(channel.description);
        });
        if (!pb.account) {
          return views.signin_buttons(window.location.href, method = "login");
        } else {
          pb_subs = pb.api.subscriptions;
          subscribe = function() {
            return pb_subs.subscribe(channel);
          };
          unsubscribe = function() {
            return pb_subs.unsubscribe(channel);
          };
          if (pb_subs.is_subscribed(channel)) {
            return goto("/oauth-apps");
          } else if (pb_subs.creating && pb_subs.creating_obj.channel_tag === channel.tag) {
            return button(".btn", function() {
              icon(".icon-spinner.icon-spin");
              return text("Following");
            });
          } else {
            return button(".btn.green", {
              onclick: subscribe
            }, function() {
              return text("Follow");
            });
          }
        }
      });
    });
  };

}).call(this);

// from 'src/views/support.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var SUGGESTION_THREAD, feel_section, inner, load, search_answers, support_track,
    indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  eval(onecup["import"]());

  SUGGESTION_THREAD = "http://www.reddit.com/r/PushBullet/comments/2rftf2/janmar_suggestion_thread/";

  inner = function(def, fn) {
    return div(def, function() {
      return div(".inner", fn);
    });
  };

  pb.support = {};

  pb.support.message_sent = false;

  support_track = function(type) {
    return function() {
      return track("support_link", {
        type: type
      });
    };
  };

  pb.support.guesses = [];

  load = function() {
    return pb.net.get_plain("/img/support/support.json", {}, function(data) {
      return pb.support.guesses = data;
    });
  };

  views.support = function() {
    var new_input_syle;
    new_input_syle = function() {
      border_radius(0);
      margin(0);
      padding("15px 10px");
      border_width(1);
      border_color(colors.gray2);
      font_size(16);
      return margin_bottom(-1);
    };
    with_view("support", {
      enter: function() {
        var ref, ref1;
        pb.support.name = ((ref = pb.account) != null ? ref.name : void 0) || "";
        pb.support.email = ((ref1 = pb.account) != null ? ref1.email : void 0) || "";
        pb.support.message_sent = false;
        onecup.scroll_top();
        return load();
      }
    });
    return inner(".support-page", function() {
      background("white");
      padding("60px 40px");
      box_shadow("0 0 8px rgba(0,0,0,.06),0 4px 16px rgba(0,0,0,.12)");
      h1(function() {
        margin_bottom(20);
        font_weight("normal");
        return text("Get in touch:");
      });
      div(".feedback-form", function() {
        var ref;
        overflow("hidden");
        if (!pb.support.message_sent) {
          div(function() {
            var ref;
            if (pb.support.error) {
              background_color("rgba(255,0,0,.1)");
              padding(10);
              margin_bottom(10);
              color(colors.gray4);
              text(pb.support.error);
              text(" ");
              text((ref = pb.support.message) != null ? ref.length : void 0);
              return text("/50");
            }
          });
          div(function() {
            var ref;
            return input({
              type: "text",
              placeholder: "Your name",
              value: ((ref = pb.account) != null ? ref.name : void 0) || ""
            }, function() {
              new_input_syle();
              height(60);
              return {
                onkeyup: function(e) {
                  return pb.support.name = e.target.value;
                }
              };
            });
          });
          div(function() {
            var ref;
            return input({
              type: "text",
              placeholder: "Your email",
              value: ((ref = pb.account) != null ? ref.email : void 0) || ""
            }, function() {
              new_input_syle();
              height(60);
              return onkeyup(function(e) {
                return pb.support.email = e.target.value;
              });
            });
          });
          textarea({
            placeholder: "Your message here",
            name: "error-report"
          }, function() {
            new_input_syle();
            padding("15px 15px");
            return onkeyup(function(e) {
              pb.support.message = e.target.value;
              if (pb.support.message.length > 50) {
                return pb.support.error = null;
              }
            });
          });
          if (((ref = pb.support.message) != null ? ref.length : void 0) > 1) {
            search_answers();
          }
          return button(".btn.green", function() {
            border_radius(0);
            margin_top(20);
            text("Send us a message");
            return onclick((function(_this) {
              return function() {
                if (!pb.support.message || pb.support.message.length < 50) {
                  pb.support.error = "Could you please make your message a little longer? More info can make a big difference to us.";
                  return;
                }
                track("support_email_sent");
                pb.api.error_report(pb.support.email, "Message from " + pb.support.name, pb.support.message);
                return pb.support.message_sent = true;
              };
            })(this));
          });
        } else {
          return h2(function() {
            return text("Thanks!");
          });
        }
      });
      return div(function() {
        margin_top(20);
        text("You can also send us a message at ");
        a({
          href: "mailto:hey@pushbullet.com"
        }, function() {
          return text("hey@pushbullet.com");
        });
        return text(".");
      });
    });
  };

  feel_section = function() {
    return h3(function() {
      var feel, j, len, ref, results;
      text("How do you feel?");
      nbsp(6);
      ref = ["said", "happy", "angry", "confused"];
      results = [];
      for (j = 0, len = ref.length; j < len; j++) {
        feel = ref[j];
        results.push((function(feel) {
          return span(function() {
            display("inline-block");
            if (pb.support.feel === feel) {
              background_color(colors.green2);
            } else {
              background_color(colors.gray2);
            }
            onclick(function() {
              return pb.support.feel = feel;
            });
            color("white");
            margin("0px 5px");
            padding("2px 6px");
            return text(feel);
          });
        })(feel));
      }
      return results;
    });
  };

  search_answers = function() {
    var guess, i, j, k, l, len, len1, len2, len3, len4, m, matched, n, o, pair, ref, ref1, ref2, results, search, tag, tags, word, words;
    search = pb.support.message.toLowerCase();
    if (search.length < 30) {
      return;
    }
    matched = [];
    ref = pb.support.guesses;
    for (j = 0, len = ref.length; j < len; j++) {
      guess = ref[j];
      guess.score = 0;
      guess.tags_matched = [];
      words = search.split(" ");
      tags = guess.tags;
      for (k = 0, len1 = words.length; k < len1; k++) {
        word = words[k];
        for (l = 0, len2 = tags.length; l < len2; l++) {
          tag = tags[l];
          if (tag && tag === word) {
            guess.score += 1;
            guess.tags_matched.push(tag);
          }
        }
      }
      for (i = m = 0, ref1 = words.length - 1; 0 <= ref1 ? m < ref1 : m > ref1; i = 0 <= ref1 ? ++m : --m) {
        pair = words[i] + " " + words[i + 1];
        for (n = 0, len3 = tags.length; n < len3; n++) {
          tag = tags[n];
          if (tag && tag === pair) {
            guess.score += 3;
            guess.tags_matched.push(tag);
          }
        }
      }
      if (guess.score > 0) {
        matched.push(guess);
      }
    }
    matched.sort(function(a, b) {
      return b.score - a.score;
    });
    if (matched.length > 0) {
      ref2 = matched.slice(0, 3);
      results = [];
      for (o = 0, len4 = ref2.length; o < len4; o++) {
        guess = ref2[o];
        results.push(div(function() {
          margin("30px 0px");
          h3(function() {
            return text(guess.name);
          });
          p(function() {
            var len5, q, ref3, results1;
            margin_left(-5);
            font_size(15);
            ref3 = guess.tags;
            results1 = [];
            for (q = 0, len5 = ref3.length; q < len5; q++) {
              tag = ref3[q];
              results1.push(span(function() {
                display("inline-block");
                if (indexOf.call(guess.tags_matched, tag) >= 0) {
                  background_color(colors.green2);
                } else {
                  background_color(colors.gray2);
                }
                color("white");
                margin("0px 5px");
                padding("0px 6px");
                return text(tag);
              }));
            }
            return results1;
          });
          return p(function() {
            var body;
            body = guess.body;
            body = body.replace(/(?:\r\n|\r|\n)/g, '<br/>');
            return raw(body);
          });
        }));
      }
      return results;
    }
  };

  css(".support-fab .text", function() {
    width(0);
    padding_left(0);
    return transition("all 0.25s ease-in-out");
  });

  css(".support-fab:hover .text", function() {
    width(75);
    padding_left(10);
    return transition("all 0.25s ease-in-out");
  });

  views.support_fab = function() {
    return div(".support-fab", function() {
      position("fixed");
      bottom(20);
      right(20);
      border_radius(100);
      background_color("white");
      border("1px solid " + colors.white2);
      padding(12);
      font_size(16);
      z_index("100");
      cursor("pointer");
      return a({
        href: "https://help.pushbullet.com"
      }, function() {
        div(".text", function() {
          float("left");
          color(colors.gray2);
          height(26);
          line_height(26);
          overflow("hidden");
          white_space("nowrap");
          return text("Get help");
        });
        return div(function() {
          float("right");
          color(colors.gray2);
          width(26);
          height(26);
          padding(0);
          font_size(28);
          line_height(26);
          text_align("center");
          overflow("hidden");
          white_space("nowrap");
          return text("?");
        });
      });
    });
  };

}).call(this);

// from 'src/views/about_page.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var heading, people, shuffle;

  eval(onecup["import"]());

  heading = function(message) {
    return h1(function() {
      margin_top(60);
      margin_bottom(60);
      font_weight("bold");
      text_align("center");
      return text(message);
    });
  };

  shuffle = function(l) {
    return l.sort(function(a, b) {
      return Math.random() - .5;
    });
  };

  people = [];

  people.push({
    image: "Ryan.png",
    name: "Ryan Oldenburg",
    text: "Cofounder & CEO"
  });

  people.push({
    image: "Andre.png",
    name: "Andre von Houck",
    text: "Cofounder"
  });

  people.push({
    image: "Chris.png",
    name: "Chris Hesse",
    text: "Cofounder"
  });


  /*
  people.push
      image: "Schwers.png"
      name: "Ryan Schwers"
      text: "iOS/Mac Developer"
  people.push
      image: "Laurel.png"
      name: "Laurel D."
      text: "Designer"
  people.push
      image: "Yarian.png"
      name: "Yarian Gomez"
      text: "Android Developer"
  people.push
      image: "Andrew.png"
      name: "Andrew Brower "
      text: "Windows Developer"
   */

  shuffle(people);

  views.about_page = function() {
    with_view("about_page", {
      enter: function() {
        return onecup.scroll_top();
      }
    });
    return div(".about-page", function() {
      background_color(colors.white1);
      return div(".inner", function() {
        background("white");
        min_height(1000);
        padding("1px 20px 40px 20px");
        box_shadow("0 0 8px rgba(0,0,0,.06),0 4px 16px rgba(0,0,0,.12)");
        heading("About Us");
        p(function() {
          padding("0px 100px 20px 100px");
          return text("Pushbullet bridges the gap between your phone, tablet, and computer, enabling them to work better together. From seeing your phone's notifications on your computer, to easily transferring links, files, and more between devices, Pushbullet saves you time by making what used to be difficult or impossible, easy.");
        });
        p(function() {
          padding("0px 100px 20px 100px");
          return text("Headquartered in San Francisco, Pushbullet was founded to make all of your devices work better for you, no matter which one you happen to be using.");
        });
        div(function() {
          var i, len, person, results;
          padding("30px 0px");
          overflow("hidden");
          display("flex");
          flex_wrap("wrap");
          justify_content("center");
          results = [];
          for (i = 0, len = people.length; i < len; i++) {
            person = people[i];
            results.push(div(function() {
              margin("30px 10px");
              width(180);
              text_align("center");
              img({
                src: "/img/about/" + person.image,
                width: "180",
                height: "180"
              });
              div(function() {
                font_size(20);
                margin("5px 0px");
                return text(person.name);
              });
              return div(function() {
                font_size(16);
                margin("5px 0px");
                return text(person.text);
              });
            }));
          }
          return results;
        });
        return p(function() {
          padding("40px 100px 40px 100px");
          color(colors.gray2);
          text_align("center");
          div(function() {
            font_size(22);
            return raw("&hearts;");
          });
          return div(function() {
            return text("We are the small band of superheroes behind Pushbullet.");
          });
        });
      });
    });
  };

}).call(this);

// from 'src/views/account.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var api_key_form, cancelingPro, connected_accounts, delete_account_flag, delete_account_form, delete_all_pushes, delete_pushes_flag, downgradingPro, draw_account, pro_section, reset_api_key_flag, sub_tab;

  eval(onecup["import"]());

  views.settings = function() {
    padding(20);
    if (pb.sidebar.sub_tab.toLowerCase() === "account") {
      views.account_page();
    }
    if (pb.sidebar.sub_tab.toLowerCase() === "history") {
      views.edit_pushes();
    }
    if (pb.sidebar.sub_tab.toLowerCase() === "people") {
      views.edit_chats();
    }
    if (pb.sidebar.sub_tab.toLowerCase() === "devices") {
      views.edit_devices();
    }
    if (pb.sidebar.sub_tab.toLowerCase() === "encryption") {
      views.encryption();
    }
    if (pb.sidebar.sub_tab.toLowerCase() === "channels") {
      views.edit_channels();
    }
    if (pb.sidebar.sub_tab.toLowerCase() === "apps") {
      views.edit_grants();
    }
    if (pb.sidebar.sub_tab.toLowerCase() === "clients") {
      views.edit_clients();
    }
    if (pb.sidebar.sub_tab.toLowerCase() === "blocks") {
      views.edit_blocks();
    }
    if (pb.sidebar.sub_tab.toLowerCase() === "invite") {
      return views.setting_invite();
    }
  };

  views.account_page = function() {
    padding(20);
    div(".section", function() {
      return connected_accounts();
    });
    div(".section", function() {
      pro_section();
      return padding_bottom(30);
    });
    div(".section", function() {
      margin_top(60);
      return api_key_form();
    });
    return div(".section", function() {
      margin_top(60);
      return delete_account_form();
    });
  };

  sub_tab = function(name, image_url, type, show) {
    if (show == null) {
      show = true;
    }
    if (!show && type !== pb.sidebar.sub_tab) {
      return;
    }
    return div(".target.pointer", function() {
      position("relative");
      min_height(52);
      height(52);
      width("100%");
      if (type === pb.sidebar.sub_tab) {
        background_color("white");
      }
      onclick(function() {
        track("sidebar_sub_tab", {
          type: name
        });
        goto("/#settings/" + type);
        return pb.sidebar.sub_tab = type;
      });
      raw_img({
        src: image_url
      }, function() {
        float("left");
        margin_left(12);
        margin_top(10);
        width(32);
        height(32);
        return border_radius(16);
      });
      return div(function() {
        css_text_overflow();
        position("absolute");
        top(14);
        left(12 + 32 + 12);
        right(0);
        color(colors.gray3);
        return text(name);
      });
    });
  };

  views.account_side_bar = function() {
    margin_top(15);
    sub_tab("Account", pb.account.image_url, "account");
    sub_tab("Push History", pb.api.pushes.default_image_url, "history");
    sub_tab("Devices", pb.api.devices.default_image_url, "devices");
    sub_tab("Invite", pb.api.chats.default_image_url, "invite");
    sub_tab("People", pb.api.chats.default_image_url, "people");
    sub_tab("Blocked People", pb.api.chats.default_image_url, "blocks", pb.api.blocks.all.length > 0);
    sub_tab("Channels", pb.api.channels.default_image_url, "channels", pb.api.channels.all.length > 0);
    sub_tab("Connected Apps", pb.api.grants.default_image_url, "apps", pb.api.grants.all.length > 0);
    sub_tab("Clients", pb.api.clients.default_image_url, "clients", pb.api.clients.all.length > 0);
    return sub_tab("End-to-End Encryption", "/img/deviceicons/encryption.png", "encryption");
  };

  views.edit_pushes = function() {
    padding(20);
    return div(".section", function() {
      return delete_all_pushes();
    });
  };

  draw_account = function(account) {
    if (account !== "add") {
      return div(function() {
        var img_url;
        float("left");
        width(200);
        height(200);
        text_align("center");
        img_url = account.image_url || pb.api.accounts.default_image_url;
        img({
          src: pb.api.resize_img(img_url, 68 * 2)
        }, function() {
          width(68);
          height(68);
          return border_radius(34);
        });
        div(function() {
          margin("5px");
          font_size(18);
          color(colors.gray2);
          text_transform("capitalize");
          return text(account.type + " account");
        });
        div(function() {
          margin("5px");
          font_size(16);
          return text(account.name);
        });
        div(function() {
          margin("5px");
          font_size(16);
          return text(account.email);
        });
        if (!account.primary) {
          return div(function() {
            margin("20px 0px");
            return button(".hover-red", function() {
              if (pb.api.accounts.delete_check === account) {
                text("I am sure");
                return onclick(function() {
                  return pb.api.accounts["delete"](account);
                });
              } else {
                text("Disconnect");
                return onclick(function() {
                  return pb.api.accounts.delete_check = account;
                });
              }
            });
          });
        }
      });
    } else {
      return div(".pointer", function() {
        float("left");
        onclick(function() {
          return goto("/signin?method=add");
        });
        width(200);
        height(200);
        text_align("center");
        img({
          src: "/img/deviceicons/add.png"
        }, function() {
          width(68);
          height(68);
          return border_radius(34);
        });
        return div(function() {
          margin("5px");
          font_size(18);
          color(colors.gray2);
          return text("Connect Account");
        });
      });
    }
  };

  connected_accounts = function() {
    var a, account, accounts, i, len, lowest, ref;
    h2(function() {
      return text("Connected Accounts");
    });
    lowest = null;
    ref = pb.api.accounts.all;
    for (i = 0, len = ref.length; i < len; i++) {
      account = ref[i];
      if (!lowest || lowest.created > account.created) {
        lowest = account;
      }
    }
    if (lowest != null) {
      lowest.primary = true;
    }
    accounts = (function() {
      var j, len1, ref1, results;
      ref1 = pb.api.accounts.all;
      results = [];
      for (j = 0, len1 = ref1.length; j < len1; j++) {
        a = ref1[j];
        results.push(a);
      }
      return results;
    })();
    accounts.push("add");
    div(function() {
      width("100%");
      return height(20);
    });
    return grid_layout({
      width: pb.pushbox.width_mainbar,
      element_width: 200,
      element_height: 260,
      elements: accounts,
      draw: draw_account
    });
  };

  delete_pushes_flag = false;

  delete_all_pushes = function() {
    h2(function() {
      return text("Delete Entire Push History");
    });
    p(function() {
      if (delete_pushes_flag === true) {
        color(colors.red);
      }
      text("This cannot be undone. All of your push messages and attached files will be permanently deleted. ");
      return text("This does not include SMS data.");
    });
    if (delete_pushes_flag === "done") {
      if (pb.api.pushes.all.length > 0) {
        return p(function() {
          color(colors.red);
          icon(".icon-spinner.icon-spin");
          return text("Your history is being deleted");
        });
      } else {
        return p(function() {
          return text("Your history has been deleted");
        });
      }
    } else if (delete_pushes_flag) {
      button(function() {
        onclick(function() {
          return delete_pushes_flag = false;
        });
        return text("Dont Delete All History");
      });
      nbsp(5);
      return button(".red", function() {
        onclick(function() {
          pb.api.pushes.delete_all();
          return delete_pushes_flag = "done";
        });
        return text("Delete Push History");
      });
    } else {
      return button(".hover-red", function() {
        onclick(function() {
          return delete_pushes_flag = true;
        });
        return text("Delete Push History");
      });
    }
  };

  reset_api_key_flag = false;

  api_key_form = function() {
    h2(function() {
      return text("Access Tokens");
    });
    p(function() {
      text("Using an access token grants full access to your account. Don't share this lightly. ");
      text("You need the access token in order to use the ");
      a({
        href: "https://docs.pushbullet.com/",
        target: "_blank"
      }, function() {
        return text("API");
      });
      return text(".");
    });
    if (pb.api.account.generated_access_token) {
      div(function() {
        background_color(colors.gray4);
        color("white");
        margin("20px 0px");
        padding("10px 0px");
        border_radius(5);
        text_align("center");
        font_size(15);
        return text(pb.api.account.generated_access_token);
      });
    } else {
      button(".hover-red", function() {
        onclick(function() {
          return pb.api.account.create_access_token();
        });
        return text("Create Access Token");
      });
    }
    br();
    br();
    p(function() {
      return text("Resetting your access tokens will sign you out everywhere. Use this if one of your devices gets lost or stolen. You will have to sign in again on each device.");
    });
    return div(".control", function() {
      if (!reset_api_key_flag) {
        return button(".hover-red", {
          onclick: function() {
            return reset_api_key_flag = true;
          }
        }, function() {
          return text("Reset All Access Tokens");
        });
      } else {
        button(".gray", {
          onclick: function() {
            return reset_api_key_flag = false;
          }
        }, function() {
          return text("Don't Reset All Access Tokens");
        });
        nbsp(5);
        return button(".red", {
          onclick: function() {
            pb.api.account.delete_all_access_tokens();
            return reset_api_key_flag = false;
          }
        }, function() {
          return text("Reset All Access Tokens");
        });
      }
    });
  };

  views.encryption = function() {
    var crud_pic;
    h2(function() {
      return text("End-to-End Encryption");
    });
    p(function() {
      return text("Pushbullet already encrypts your data in transit using https. Enabling end-to-end encryption adds an additional layer of privacy for your phone's notifications, clipboard, and SMS sync.");
    });
    p(function() {
      return text("Enter a password to enable end-to-end encryption. You will need to enter this password on each of your devices.");
    });
    div(".control", function() {
      margin_bottom(30);
      input("#password", {
        type: "password",
        value: pb.db.get("e2e_key")
      }, function() {
        display("inline-block");
        width(320);
        margin_bottom(10);
        margin_top(10);
        margin_right(20);
        height(41);
        return onkeydown(function(e) {
          if (e.keyCode === 13) {
            return pb.e2e.set_password(onecup.lookup("#password").value);
          }
        });
      });
      button(function() {
        display("inline-block");
        onclick(function() {
          return pb.e2e.set_password(onecup.lookup("#password").value);
        });
        text("Save");
        return margin_right(20);
      });
      return button(".hover-red", function() {
        display("inline-block");
        onclick(function() {
          return pb.e2e.set_password("");
        });
        return text("Clear");
      });
    });
    h3(function() {
      return text("Device Status");
    });
    crud_pic = function(image_url) {
      return raw_img({
        src: image_url
      }, function() {
        display("inline-block");
        margin_top(6);
        width(32);
        height(32);
        return border_radius(16);
      });
    };
    return table(function() {
      var device, i, len, ref, results;
      ref = pb.api.devices.all;
      results = [];
      for (i = 0, len = ref.length; i < len; i++) {
        device = ref[i];
        results.push(tr(function() {
          td(function() {
            width(42);
            return crud_pic(pb.api.devices.guess_icon(device));
          });
          td(function() {
            min_width(100);
            return text(device.nickname);
          });
          td(function() {
            padding("0px 20px");
            if (device.key_fingerprint) {
              color(colors.green1);
              icon(".pushfont-lock");
              return text("Encrypted");
            }
          });
          return td(function() {
            if (device.key_fingerprint) {
              if (device.key_fingerprint.trim() === pb.e2e.key_fingerprint) {
                return text("Password matches");
              } else {
                color(colors.red);
                return text("Different password");
              }
            }
          });
        }));
      }
      return results;
    });
  };

  delete_account_flag = false;

  delete_account_form = function() {
    h2(function() {
      return text("Delete Account");
    });
    if (delete_account_flag) {
      h1(".redish", function() {
        return text("Danger! Danger! Danger!");
      });
      ol(".redish", function() {
        li(function() {
          return text("You account is about to be deleted.");
        });
        li(function() {
          return text("This is not reversible.");
        });
        li(function() {
          return text("All your data will be lost.");
        });
        return li(function() {
          return text("Cats will cry in the night.");
        });
      });
      br();
      br();
      p(function() {
        return text("Care to tell us why you are leaving?");
      });
      ul(function() {
        var i, len, option, ref, results;
        ref = ["I couldn't get it to work.", "I don't need/use Pushbullet.", "Something else (Let us know below)"];
        results = [];
        for (i = 0, len = ref.length; i < len; i++) {
          option = ref[i];
          results.push((function(option) {
            return div(function() {
              margin_left(10);
              input(".reason", {
                type: "radio",
                value: option,
                name: "reason",
                onclick: function() {
                  return pb.delete_reason = option;
                }
              });
              nbsp(5);
              return text(option);
            });
          })(option));
        }
        return results;
      });
      div(function() {
        return textarea({
          onchange: function(e) {
            return pb.delete_explanation = e.target.value;
          }
        });
      });
      br();
      br();
      button(".gray", {
        onclick: function() {
          return delete_account_flag = false;
        }
      }, function() {
        return text("Don't Delete Account");
      });
      nbsp(5);
      return button(".red", {
        onclick: function() {
          track("delete_account", {
            email: pb.account.email,
            reason: pb.delete_reason,
            explanation: pb.delete_explanation
          });
          return pb.api.account["delete"]();
        }
      }, function() {
        return text("Yes, I am sure, Delete account now!");
      });
    } else {
      p(function() {
        return text("This cannot be undone. Be sure you want to delete your account.");
      });
      return button(".hover-red", {
        onclick: function() {
          return delete_account_flag = true;
        }
      }, function() {
        return text("Delete Account");
      });
    }
  };

  views.setting_invite = function() {
    return views.invite();
  };

  downgradingPro = false;

  cancelingPro = false;

  pro_section = function() {
    h2(function() {
      return text("Pushbullet Pro");
    });
    if (pb.pro.downgrade_status) {
      return div(function() {
        var ref;
        if (pb.pro.downgrade_status === "success") {
          if ((ref = pb.account) != null ? ref.pro : void 0) {
            return text("Pro canceled successfully. Your card will not be charged again. You will continue to have Pro until it expires.");
          } else {
            return text("Pro canceled successfully. Your card will not be charged again.");
          }
        } else {
          return text("Sorry, cancelling Pro failed. Please try again or email us at contact@pushbullet.com");
        }
      });
    } else if (pb.account.pro) {
      if (!cancelingPro) {
        p(function() {
          text("You have a ");
          span(function() {
            font_weight("bold");
            return text(pb.account.plan_id);
          });
          return text(" Pro plan. Thank you for supporting Pushbullet.");
        });
      }
      if (cancelingPro) {
        text("Canceling Pro");
        return icon(".icon-spinner.icon-spin");
      } else if (downgradingPro) {
        button(function() {
          text("Don't Cancel Pro");
          return onclick(function() {
            return downgradingPro = false;
          });
        });
        text(" ");
        return button(".red", function() {
          text("Cancel Pro");
          return onclick(function() {
            cancelingPro = true;
            return pb.api.account.downgrade_pro();
          });
        });
      } else {
        return button(".hover-red", function() {
          text("Cancel Pro");
          return onclick(function() {
            return downgradingPro = true;
          });
        });
      }
    } else {
      p(function() {
        text("Upgrade to Pro for additional features. ");
        a({
          href: "/pro"
        }, function() {
          return text("Click here to learn more");
        });
        return text(".");
      });
      return button(".green", function() {
        text("Upgrade to Pro");
        return onclick(function() {
          return goto("/pro");
        });
      });
    }
  };

}).call(this);

// from 'src/views/setup.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var app_link, desktops, draw_invite_target, draw_step_header, draw_step_sidetab, find_devices, find_step, goto_next_step, make_pie_svg, mobiles, setup_desktop, setup_invite, setup_links, setup_main_tab, setup_mobile, setup_page, setup_progress, setup_steps;

  eval(onecup["import"]());

  pb.setup = {};

  mobiles = [["android", "Android"], ["ios", "iPhone or iPad"]];

  desktops = [["chrome", "Chrome"], ["firefox", "Firefox"], ["safari", "Safari"], ["opera", "Opera"], ["windows", "PC"]];

  make_pie_svg = function(value, radius, size) {
    var border, d, fill, longArc, path, x, y;
    if (radius == null) {
      radius = 15;
    }
    if (size == null) {
      size = 32;
    }
    fill = "#808E8D";
    value = Math.min(Math.max(value, 0), 100);
    if (value >= 100) {
      path = "<circle cx='" + radius + "' cy='" + radius + "' r='" + radius + "' fill='" + fill + "' />";
    } else {
      x = Math.cos((2 * Math.PI) / (100 / value));
      y = Math.sin((2 * Math.PI) / (100 / value));
      longArc = value <= 50 ? 0 : 1;
      d = "M" + radius + "," + radius + " L" + radius + "," + 0 + ", A" + radius + "," + radius + " 0 " + longArc + ",1 " + (radius + y * radius) + "," + (radius - x * radius) + " z";
      path = "<path d='" + d + "' fill='" + fill + "' />";
    }
    border = "<circle cx='" + radius + "' cy='" + radius + "' r='" + (radius - 1) + "' fill='rgba(0,0,0,0)' stroke-width='2' stroke='" + fill + "' />";
    return "<svg height='" + size + "' width='" + size + "'>" + path + border + "</svg>";
  };

  find_devices = function(things) {
    var device, i, j, len, len1, ref, thing;
    ref = pb.api.devices.all;
    for (i = 0, len = ref.length; i < len; i++) {
      device = ref[i];
      if (device.active) {
        for (j = 0, len1 = things.length; j < len1; j++) {
          thing = things[j];
          if (device.type === thing[0]) {
            return true;
          }
        }
      }
    }
  };

  pb.setup.think = function() {
    var fn, i, len, step;
    if (!pb.setup.should_show()) {
      return;
    }
    fn = function(step) {
      var j, k, l, len1, len2, len3, push, ref, ref1, ref2, results, results1, results2;
      if (pb.api.account.preferences["setup_" + step.type]) {
        return step.done = true;
      } else {
        switch (step.type) {
          case "mobile":
            if (find_devices(mobiles)) {
              return pb.setup.done("mobile");
            }
            break;
          case "desktop":
            if (find_devices(desktops)) {
              return pb.setup.done("desktop");
            }
            break;
          case "channels":
            if (pb.api.subscriptions.all.length > 0) {
              return pb.setup.done("channels");
            }
            break;
          case "links":
            ref = pb.api.pushes.all;
            results = [];
            for (j = 0, len1 = ref.length; j < len1; j++) {
              push = ref[j];
              if (push.type === "link" && push.direction !== "incoming") {
                results.push(pb.setup.done("links"));
              } else {
                results.push(void 0);
              }
            }
            return results;
            break;
          case "files":
            ref1 = pb.api.pushes.all;
            results1 = [];
            for (k = 0, len2 = ref1.length; k < len2; k++) {
              push = ref1[k];
              if (push.type === "file") {
                results1.push(pb.setup.done("files"));
              } else {
                results1.push(void 0);
              }
            }
            return results1;
            break;
          case "chat":
            ref2 = pb.api.pushes.all;
            results2 = [];
            for (l = 0, len3 = ref2.length; l < len3; l++) {
              push = ref2[l];
              if (push.direction === "outgoing") {
                results2.push(pb.setup.done("chat"));
              } else {
                results2.push(void 0);
              }
            }
            return results2;
        }
      }
    };
    for (i = 0, len = setup_steps.length; i < len; i++) {
      step = setup_steps[i];
      fn(step);
    }
  };

  find_step = function(type) {
    var i, len, step;
    for (i = 0, len = setup_steps.length; i < len; i++) {
      step = setup_steps[i];
      if (step.type === type) {
        return step;
      }
    }
  };

  pb.setup.should_show = function() {
    var ref;
    if (!pb.account) {
      return false;
    }
    if (((ref = pb.api.account.preferences) != null ? ref.setup_done : void 0) === true) {
      return false;
    }
    if (pb.account.created < 1440698722) {
      return false;
    }
    return true;
  };

  pb.setup.done = function(type, manual) {
    var i, len, results, step;
    if (manual == null) {
      manual = false;
    }
    if (!pb.setup.should_show()) {
      return;
    }
    results = [];
    for (i = 0, len = setup_steps.length; i < len; i++) {
      step = setup_steps[i];
      if (step.type === type && !step.done) {
        step.done = true;
        pb.api.account.setup_done(type);
        track("step_done", {
          type: type,
          manual: manual
        });
        if (pb.setup.step_number() === pb.setup.all_steps()) {
          results.push(track("all_steps_done"));
        } else {
          results.push(void 0);
        }
      } else {
        results.push(void 0);
      }
    }
    return results;
  };

  pb.setup.restart = function() {
    var i, len, step;
    for (i = 0, len = setup_steps.length; i < len; i++) {
      step = setup_steps[i];
      step.done = false;
      pb.api.account.setup_restart(step.type);
    }
    pb.api.account.preferences.setup_done = false;
    return pb.api.account.save();
  };

  setup_main_tab = {
    name: "Progress",
    type: "progress",
    image: "/img/setup/chat.png"
  };

  setup_steps = [];

  setup_steps.push({
    name: "Set up your phone",
    type: "mobile",
    image: "/img/setup/mobile.png"
  });

  setup_steps.push({
    name: "Set up your computer",
    type: "desktop",
    image: "/img/setup/desktop.png"
  });

  setup_steps.push({
    name: "Text from your computer",
    type: "sms",
    image: "/img/setup/SMS.png",
    help_url: "https://help.pushbullet.com/articles/how-do-i-send-text-messages-from-my-computer/",
    show_fn: function() {
      var device, has_ios, i, len, ref, ref1;
      has_ios = false;
      ref = pb.api.devices.all;
      for (i = 0, len = ref.length; i < len; i++) {
        device = ref[i];
        if (device.active && ((ref1 = device.model) != null ? ref1.toLowerCase().indexOf("iphone") : void 0) !== -1) {
          has_ios = true;
        }
        if (device.active && device.kind === "android") {
          return true;
        }
      }
      return !has_ios;
    }
  });

  setup_steps.push({
    name: "See your notifications",
    type: "notifications",
    image: "/img/setup/notifications.png",
    help_url: "https://help.pushbullet.com/articles/how-do-i-see-my-phones-notifications-on-my-computer/"
  });

  setup_steps.push({
    name: "Push links to devices",
    type: "links",
    image: "/img/setup/links.png",
    help_url: "https://help.pushbullet.com/articles/how-do-i-send-links-with-pushbullet/"
  });

  setup_steps.push({
    name: "Push files to devices",
    type: "files",
    image: "/img/setup/files.png",
    help_url: "https://help.pushbullet.com/articles/how-do-i-send-files-with-pushbullet/"
  });

  setup_steps.push({
    name: "Chat with a friend",
    type: "chat",
    image: "/img/setup/chat.png",
    help_url: "https://help.pushbullet.com/articles/how-do-i-share-and-chat-with-friends/"
  });

  setup_steps.push({
    name: "Follow a channel",
    type: "channels",
    image: "/img/setup/channels.png",
    help_url: "https://help.pushbullet.com/articles/what-are-pushbullet-channels/"
  });

  setup_steps.push({
    name: "Invite friends",
    type: "invite",
    image: "/img/setup/invite.png",
    help_url: "https://help.pushbullet.com/articles/invite-a-friend/"
  });

  pb.setup.step_number = function() {
    var i, len, n, step;
    n = 0;
    for (i = 0, len = setup_steps.length; i < len; i++) {
      step = setup_steps[i];
      if (step.done) {
        n += 1;
      }
      if ((typeof step.show_fn === "function" ? step.show_fn() : void 0) === false) {
        n += 1;
      }
    }
    return n;
  };

  pb.setup.all_steps = function() {
    return 9;
  };

  views.setup_sidebar = function() {
    var done_ratio, i, len, results, step;
    margin_top(20);
    done_ratio = pb.setup.step_number() / pb.setup.all_steps();
    if (done_ratio === 1) {
      setup_main_tab.done = true;
    }
    draw_step_sidetab(setup_main_tab, 100 * done_ratio);
    div(function() {
      return height(20);
    });
    results = [];
    for (i = 0, len = setup_steps.length; i < len; i++) {
      step = setup_steps[i];
      if (!step.show_fn || step.show_fn()) {
        results.push(draw_step_sidetab(step));
      } else {
        results.push(void 0);
      }
    }
    return results;
  };

  draw_step_sidetab = function(step, pie) {
    return div(".pointer", function() {
      height(60);
      position("relative");
      onclick(function() {
        track("step_click", {
          type: step.type
        });
        onecup.lookup("#mainbar").scrollTop = 0;
        return goto("#setup/" + step.type);
      });
      if (pb.sidebar.sub_tab === step.type) {
        background("white");
      }
      div(function() {
        position("absolute");
        top(10);
        left(12);
        width(32);
        height(32);
        if (pie) {
          return raw(make_pie_svg(pie));
        } else {
          return raw_img({
            src: step.image
          }, function() {
            width(32);
            height(32);
            return border_radius(16);
          });
        }
      });
      if (step.done) {
        img({
          src: "/img/setup/doneOverlay.png"
        }, function() {
          position("absolute");
          top(10);
          left(12);
          width(32);
          height(32);
          return border_radius(16);
        });
      }
      if (pb.pushbox.width_sidebar > 100) {
        if (step.desc) {
          div(function() {
            position("absolute");
            top(4);
            left(12 + 32 + 12);
            right(0);
            font_size(18);
            color(colors.gray3);
            css_text_overflow();
            return text(step.name);
          });
          return div(function() {
            position("absolute");
            top(30);
            left(12 + 32 + 12);
            right(0);
            font_size(12);
            color(colors.gray2);
            css_text_overflow();
            return text(step.desc);
          });
        } else {
          return div(function() {
            position("absolute");
            top(15);
            left(12 + 32 + 12);
            right(0);
            font_size(18);
            color(colors.gray3);
            css_text_overflow();
            return text(step.name);
          });
        }
      }
    });
  };

  goto_next_step = function(type) {
    var i, len, step;
    onecup.lookup("#mainbar").scrollTop = 0;
    for (i = 0, len = setup_steps.length; i < len; i++) {
      step = setup_steps[i];
      if (!step.done) {
        goto("#setup/" + step.type);
        return;
      }
    }
    return goto("#setup/progress");
  };

  views.setup = function() {
    return div(function() {
      var float_footer, step, type;
      display("flex");
      flex_direction("column");
      min_height("100%");
      float_footer = false;
      type = pb.sidebar.sub_tab.toLowerCase();
      div(function() {
        flex("1");
        switch (type) {
          case "progress":
            return setup_progress();
          case "mobile":
            return setup_mobile();
          case "desktop":
            return setup_desktop();
          case "sms":
            return setup_page("sms");
          case "notifications":
            return setup_page("notifications");
          case "chat":
            return setup_page("chat");
          case "links":
            return setup_links();
          case "files":
            return setup_page("files");
          case "channels":
            return setup_page("channels");
          case "invite":
            return setup_invite();
        }
      });
      step = find_step(type);
      if (step) {
        return div(function() {
          flex("0");
          padding(30);
          text_align("right");
          if (step.help_url) {
            button(function() {
              onclick(function() {
                track("step_help_button", {
                  type: type
                });
                return window.open(step.help_url);
              });
              return text("Help");
            });
            nbsp(5);
          }
          button(function() {
            onclick(function() {
              track("step_skip_button", {
                type: type
              });
              pb.setup.done(type, true);
              return goto_next_step(type);
            });
            return text("Skip");
          });
          nbsp();
          return button(".green", function() {
            onclick(function() {
              track("step_done_button", {
                type: type
              });
              pb.setup.done(type, true);
              return goto_next_step(type);
            });
            return text("Done");
          });
        });
      }
    });
  };

  setup_progress = function() {
    var draw_step, step, steps_to_show;
    div(function() {
      padding_top(20);
      margin("0px auto");
      max_width(500);
      text_align("center");
      if (pb.setup.step_number() === pb.setup.all_steps()) {
        div(function() {
          h1(function() {
            line_height(40);
            return text("Congratulations, you are a Pushbullet expert!");
          });
          return p(function() {
            return text("You now know about all of Pushbullet's best features.");
          });
        });
        div(function() {
          padding_top(10);
          padding_bottom(40);
          return button(".green", function() {
            onclick(function() {
              pb.api.account.preferences.setup_done = true;
              pb.api.account.save();
              track("setup_done");
              return goto("#people/me");
            });
            return text("I'm done!");
          });
        });
        return div(function() {
          height(2);
          return background_color(colors.gray1);
        });
      } else {
        return div(function() {
          padding("0px 20px 0px 20px");
          h1(function() {
            return text("Welcome to Pushbullet!");
          });
          return div(function() {
            padding_top(5);
            return text("Follow these steps to discover why people love Pushbullet.");
          });
        });
      }
    });
    div(function() {
      padding_top(10);
      padding_bottom(30);
      margin("0px auto");
      max_width(500);
      text_align("center");
      div(function() {
        margin_top(20);
        color(colors.green2);
        font_weight("bold");
        font_size(12);
        return p(function() {
          return text("Your progress");
        });
      });
      return div(function() {
        margin("0px 20px");
        height(20);
        border("1px solid " + colors.green2);
        border_radius(6);
        overflow("hidden");
        return div(function() {
          background(colors.green2);
          width(Math.ceil(pb.setup.step_number() / pb.setup.all_steps() * 100) + "%");
          return height(18);
        });
      });
    });
    draw_step = function(step) {
      return div(".pointer", function() {
        width(160);
        height(180);
        margin(15);
        onclick(function() {
          track("step_big_click", {
            type: step.type
          });
          onecup.lookup("#mainbar").scrollTop = 0;
          return goto("/#setup/" + step.type);
        });
        img({
          src: step.image,
          width: 100,
          height: 100
        }, function() {
          position("absolute");
          top(20);
          return left(45);
        });
        if (step.done) {
          img({
            src: "/img/setup/doneOverlay.png",
            width: 100,
            height: 100
          }, function() {
            position("absolute");
            top(20);
            return left(45);
          });
        }
        return div(function() {
          position("absolute");
          top(130);
          padding("0px 10px");
          width(160);
          text_align("center");
          return text(step.name);
        });
      });
    };
    steps_to_show = (function() {
      var i, len, results;
      results = [];
      for (i = 0, len = setup_steps.length; i < len; i++) {
        step = setup_steps[i];
        if (!step.show_fn || step.show_fn()) {
          results.push(step);
        }
      }
      return results;
    })();
    return grid_layout({
      width: pb.pushbox.width_mainbar - 60,
      element_width: 160,
      element_height: 180,
      elements: steps_to_show,
      max: 3,
      draw: draw_step
    });
  };

  draw_step_header = function(type) {
    var step;
    step = find_step(type);
    return div(function() {
      position("relative");
      height(210);
      img({
        src: step.image,
        width: 120,
        height: 120
      }, function() {
        position("absolute");
        top(14);
        left("50%");
        return transform("translate(-50%,0)");
      });
      if (step.done) {
        img({
          src: "/img/setup/doneOverlay.png",
          width: 120,
          height: 120
        }, function() {
          position("absolute");
          top(14);
          left("50%");
          return transform("translate(-50%,0)");
        });
      }
      return h1(function() {
        position("absolute");
        top(138);
        left(0);
        right(0);
        text_align("center");
        return text(step.name);
      });
    });
  };

  setup_page = function(page) {
    return div(function() {
      margin("0px auto");
      padding(20);
      max_width(500);
      draw_step_header(page);
      return views.markdown("setup_" + page);
    });
  };

  setup_mobile = function() {
    var apps;
    div(function() {
      padding(20);
      max_width(500);
      margin("0px auto");
      draw_step_header("mobile");
      p(function() {
        return text("Most of what Pushbullet does can only be done when we're installed on your phone.");
      });
      return p(function() {
        text("To set up Pushbullet on your phone, install our Android or iPhone app.");
        return margin_bottom(40);
      });
    });
    apps = [["android", "Android"], ["ios", "iPhone"]];
    grid_layout({
      width: pb.pushbox.width_mainbar,
      element_width: 160,
      element_height: 160,
      elements: apps,
      draw: app_link
    });
    return div(function() {
      padding(20);
      max_width(500);
      margin("0px auto");
      return p(function() {
        return text("After installing the app, sign in using the Google or Facebook account you've set up Pushbullet with.");
      });
    });
  };

  setup_desktop = function() {
    var apps;
    div(function() {
      padding(20);
      max_width(500);
      margin("0px auto");
      draw_step_header("desktop");
      p(function() {
        return text("Pushbullet helps your phone and computer talk to each other. To do this, we need be installed on your computer.");
      });
      return p(function() {
        text("To set up Pushbullet on your computer, install our app.");
        return margin_bottom(40);
      });
    });
    apps = [["windows", "Windows"], ["chrome", "Chrome"], ["firefox", "Firefox"], ["opera", "Opera"], ["safari", "Safari"]];
    grid_layout({
      width: pb.pushbox.width_mainbar,
      max: 3,
      element_width: 160,
      element_height: 160,
      elements: apps,
      draw: app_link
    });
    return div(function() {
      padding(20);
      max_width(500);
      margin("0px auto");
      return p(function() {
        return text("After installing the app, sign in using the Google or Facebook account you've set up Pushbullet with.");
      });
    });
  };

  setup_links = function() {
    var apps;
    div(function() {
      padding(20);
      padding_bottom(35);
      max_width(500);
      margin("0px auto");
      draw_step_header("links");
      return raw(markdown.toHTML("Pushbullet makes getting a link onto your phone almost instant.\n\nThe fast way to send links is with our browser extension. Here's how:\n\n* Install our browser extension.\n\n* Right-click on this page.\n\n* Select Pushbullet, then your phone.\n\n<br>\n\nGet our extension for your browser here:"));
    });
    apps = [["chrome", "Chrome"], ["firefox", "Firefox"], ["opera", "Opera"], ["safari", "Safari"]];
    grid_layout({
      width: pb.pushbox.width_mainbar,
      max: 2,
      element_width: 160,
      element_height: 160,
      elements: apps,
      draw: app_link
    });
    return div(function() {
      padding("0px 20px");
      max_width(500);
      margin("0px auto");
      return p(function() {
        return em(function() {
          return text("Note: Our browser extensions work great with our Windows and Mac apps. Having both is great!");
        });
      });
    });
  };

  app_link = function(app) {
    var name, small_text, type, url;
    type = app[0], name = app[1], small_text = app[2];
    url = pb.URLS[type];
    return a(".hover-fade", {
      href: url,
      target: "_blank"
    }, function() {
      display("block");
      float("left");
      width(160);
      height(160);
      text_align("center");
      text_decoration("none");
      img(".image", {
        src: "/img/apps/app-" + type + ".png",
        height: "80px"
      });
      div(function() {
        margin_top(10);
        color(colors.gray3);
        text(name);
        return div(".small", function() {
          font_size(14);
          color(colors.gray2);
          return text(small_text);
        });
      });
      return onclick(function() {
        return track("step_device_new", {
          type: type
        });
      });
    });
  };

  pb.setup.invite_picker = new Picker({
    direction: "bottom",
    placeholder: "Find your friends",
    label: "Invite:",
    email_suggest: true
  });

  pb.setup.invite_friend = function(email) {
    console.log("invite", email);
    pb.api.chats.invite(email);
    pb.setup.invite_picker.clear();
    pb.setup.invited = true;
    return pb.setup.done("invite");
  };

  css(".hover-tr", function() {
    background_color("white");
    border("0");
    css("td", function() {
      return border("0");
    });
    return css(":hover", function() {
      return background_color(colors.white1);
    });
  });

  pb.setup.invite_emails = {};

  draw_invite_target = function(target) {
    return tr(".hover-tr", function() {
      height(32);
      td(function() {
        width(30);
        padding_top(5);
        padding_left(5);
        return raw_img({
          src: target.image_url
        }, function() {
          border_radius(16);
          width(20);
          return height(20);
        });
      });
      td(function() {
        return text(target.name);
      });
      td(function() {
        font_size(14);
        color(colors.gray2);
        if (target.is_user) {
          return text("Pushbullet user");
        } else {
          return text(target.email);
        }
      });
      td(function() {
        min_width(30);
        return div(function() {
          if (target.is_user) {
            raw_img({
              src: "/img/deviceicons/pushbullet.png"
            }, function() {
              border_radius(16);
              width(20);
              return height(20);
            });
          } else {
            if (pb.setup.invite_emails[target.email]) {
              background_color(colors.green3);
              color("white");
              font_size(22);
              line_height(20);
              text_align("center");
              icon(".pushfont-check");
            } else {
              background_color(colors.gray1);
            }
          }
          width(20);
          return height(20);
        });
      });
      return onclick(function() {
        return pb.setup.invite_emails[target.email] = !pb.setup.invite_emails[target.email];
      });
    });
  };

  setup_invite = function() {
    return div(function() {
      height(window.innerHeight - pb.header.height - 101 - 1);
      overflow_y("scroll");
      border_bottom("1px solid " + colors.gray1);
      return views.invite();
    });
  };

  views.invite = function() {
    div(function() {
      margin("0px auto");
      padding(20);
      max_width(500);
      draw_step_header("invite");
      if (pb.setup.invited) {
        div(function() {
          color(colors.green2);
          font_weight("bold");
          return p(function() {
            return text("Thank you for inviting them!");
          });
        });
      } else {
        p(function() {
          return text("Like Pushbullet? Invite friends to try it out!");
        });
      }
      div(function() {
        var targets;
        position("relative");
        margin("15px 0px");
        border("1px solid " + colors.white2);
        targets = pb.api.autocomplete.targets(pb.setup.invite_picker.search);
        return pb.setup.invite_picker.draw(targets);
      });
      return div(function() {
        height(60);
        button(".green", function() {
          float("right");
          return text("Send invite");
        });
        return onclick(function() {
          var target;
          target = pb.setup.invite_picker.target;
          if (target) {
            return pb.setup.invite_friend(target.email);
          }
        });
      });
    });
    if (!pb.setup.invited) {
      div(function() {
        padding(20);
        padding_top(0);
        return table(function() {
          var i, len, results, target, targets;
          border("0");
          border_collapse("collapse");
          width("100%");
          targets = pb.api.autocomplete.invite_targets();
          if (pb.api.autocomplete.invite_targets_loading) {
            div(function() {
              height(100);
              line_height(100);
              text_align("center");
              icon(".icon-spinner.icon-spin");
              return text("loading suggestions...");
            });
          }
          results = [];
          for (i = 0, len = targets.length; i < len; i++) {
            target = targets[i];
            results.push(draw_invite_target(target));
          }
          return results;
        });
      });
      return div(function() {
        padding(20);
        height(60);
        padding_bottom(100);
        button(".green", function() {
          float("right");
          return text("Invite selected friends");
        });
        return onclick(function() {
          var email, results;
          results = [];
          for (email in pb.setup.invite_emails) {
            results.push(pb.setup.invite_friend(email));
          }
          return results;
        });
      });
    }
  };

}).call(this);

// from 'src/views/pro.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var cancelingPro, card, card_mobile, compair, downgradingPro, fancy_footer, features, line_color, paypal_approval, paypal_button, paypal_click, place, plan_card, pushbullet_pro_bar, refund_policy, section_heading, stripe_button, stripe_click, stripe_mobile_button, stripe_popup, switcher, switcher_mobile, twinkles;

  eval(onecup["import"]());

  pb.pro = {};

  place = function(x, y, w, h) {
    position("absolute");
    left(x);
    top(y);
    if (w) {
      width(w);
    }
    if (h) {
      return height(h);
    }
  };

  downgradingPro = false;

  cancelingPro = false;

  views.pro_page = function() {
    document.title = "Upgrade to Pro | Pushbullet";
    div("#pro-card", function() {
      var ref;
      if (pb.pro.downgrade_status) {
        return div(function() {
          padding("100px 20px");
          text_align('center');
          return div(function() {
            var ref;
            padding_bottom(30);
            if (pb.pro.downgrade_status === "success") {
              if ((ref = pb.account) != null ? ref.pro : void 0) {
                return text("Pro canceled successfully. Your card will not be charged again. You will continue to have Pro until it expires.");
              } else {
                return text("Pro canceled successfully. Your card will not be charged again.");
              }
            } else {
              return text("Sorry, cancelling Pro failed. Please try again or email us at contact@pushbullet.com");
            }
          });
        });
      } else if ((ref = pb.account) != null ? ref.pro : void 0) {
        return div(function() {
          padding("100px 20px");
          text_align('center');
          div(function() {
            padding_bottom(30);
            return text("You can cancel Pushbullet Pro at any time.");
          });
          if (cancelingPro) {
            text("Canceling Pro");
            return icon(".icon-spinner.icon-spin");
          } else if (downgradingPro) {
            button(function() {
              text("Don't Cancel Pro");
              return onclick(function() {
                return downgradingPro = false;
              });
            });
            text(" ");
            return button(".red", function() {
              text("Cancel Pro");
              return onclick(function() {
                cancelingPro = true;
                return pb.api.account.downgrade_pro();
              });
            });
          } else {
            return button(".red", function() {
              text("Cancel Pro");
              return onclick(function() {
                return downgradingPro = true;
              });
            });
          }
        });
      } else {
        if (window.innerWidth > 800) {
          width(900);
          margin("0px auto");
          background_color(colors.white1);
          return div(function() {
            return card();
          });
        } else {
          background_color("white");
          return card_mobile();
        }
      }
    });
    div("#pro-compair", function() {
      background_color(colors.white1);
      return div(function() {
        margin("0 auto");
        max_width(900);
        background("white");
        if (window.innerWidth > 900) {
          padding("1px 40px 100px 40px");
          box_shadow("0 0 8px rgba(0,0,0,.06),0 4px 16px rgba(0,0,0,.12)");
        } else {
          padding("1px 0px 100px 0px");
        }
        margin_bottom(60);
        return compair();
      });
    });
    return fancy_footer();
  };

  section_heading = function(name) {
    return div(function() {
      position("relative");
      height(48 + 42 + 21);
      div(function() {
        position("absolute");
        background(colors.gray2);
        height(2);
        width(300);
        margin("0px auto");
        left("50%");
        transform("translate(-50%, 0)");
        return top(48 + 12);
      });
      return div(function() {
        padding("0px 10px");
        top(48);
        position("absolute");
        background_color("white");
        font_size(21);
        color(colors.gray2);
        left("50%");
        transform("translate(-50%, 0)");
        white_space("nowrap");
        return text(name);
      });
    });
  };

  features = function() {
    var feature;
    section_heading("Features");
    feature = function(data) {
      return div(function() {
        position("relative");
        img({
          src: data.icon,
          width: 130,
          height: 130
        }, function() {
          position("absolute");
          return border_radius(130);
        });
        display("inline-block");
        margin(5);
        width(380);
        height(140);
        margin_right(20);
        margin_left(20);
        return div(function() {
          position("absolute");
          top(10);
          left(150);
          width(240);
          div(function() {
            font_size(18);
            text(data.title);
            return margin_bottom(5);
          });
          return div(function() {
            color(colors.gray2);
            line_height(20);
            font_size(14);
            return text(data.text);
          });
        });
      });
    };
    return div(function() {
      feature({
        icon: "/img/pro/blue/Links.png",
        title: "Send links",
        text: "Instantly share links between any of your devices. Never email yourself a link again just to get it somewere else."
      });
      feature({
        icon: "/img/pro/blue/Files.png",
        title: "Send files",
        text: "Moving pictures and files between your devices has never been easier. Files download automatically and can be opened right from the notifications."
      });
      feature({
        icon: "/img/pro/blue/Notifications.png",
        title: "Send your notifications",
        text: "Never miss a call or a text again while working at your computer. Pushbullet shows you WhatsApp messages, texts, phone calls, and more."
      });
      feature({
        icon: "/img/pro/blue/SMS.png",
        title: "Send messages (SMS, WhatsApp, Kik, etc)",
        text: "Istantly share links between any of your devices. Never email yourself a link again just to get it somewere else."
      });
      feature({
        icon: "/img/pro/blue/Chat.png",
        title: "Chat and share with friends",
        text: "Typing on a keyboard is so much faster than typing on a phone. Easily send and receive texts on your computer."
      });
      feature({
        icon: "/img/pro/blue/Channels.png",
        title: "Follow channels",
        text: "Pushbullet works great on all of your devices, which makes sharing and chatting with friends more convenient than ever."
      });
      feature({
        icon: "/img/pro/blue/Copypaste.png",
        title: "Universal Copy & Paste",
        text: "Copy and pasting should work acrss all of your devices. Pushbullet Pro makes this possible."
      });
      return feature({
        icon: "/img/pro/blue/AndroidSMS.png",
        title: "SMS on tablet",
        text: "Text from any Android tablet. PUshbullet Pro allows you to send and receive unlimted text from anywhere."
      });
    });
  };

  line_color = "#DEE0E3";

  css("#pro-table", function() {
    border_collapse("collapse");
    return css("td", function() {
      border("none");
      border_bottom("2px solid " + line_color);
      return padding("0px 5px");
    });
  });

  compair = function() {
    var row;
    section_heading("Compare");
    row = function(data) {
      return tr(function() {
        height(72);
        td(function() {
          if (data.icon === "android") {
            return img({
              src: "/img/pro/littleAndroid.png",
              width: 32,
              height: 32
            });
          }
        });
        td(function() {
          return typeof data.title === "function" ? data.title() : void 0;
        });
        td(function() {
          text_align("center");
          color(colors.green1);
          if (data.regular === true) {
            font_size(40);
            return icon(".pushfont-check-circle");
          } else if (data.regular === false) {
            return text("");
          } else {
            return text(data.regular);
          }
        });
        return td(function() {
          text_align("center");
          color(colors.green1);
          background_color("#E8F4E8");
          if (data.pro === true) {
            font_size(40);
            return icon(".pushfont-check-circle");
          } else if (data.pro === false) {
            return text("");
          } else {
            return text(data.pro);
          }
        });
      });
    };
    return table("#pro-table", function() {
      width("100%");
      tr(function() {
        width(788);
        height(61);
        line_height(61);
        border_bottom("2px solid " + line_color);
        font_size(18);
        font_weight("bold");
        height(61);
        th(function() {});
        th(function() {
          return text("Features");
        });
        th(function() {
          text_align("center");
          if (window.innerWidth > 620) {
            return text("Pushbullet");
          } else {
            return text("Free");
          }
        });
        return th(function() {
          text_align("center");
          color(colors.green1);
          if (window.innerWidth > 620) {
            return text("Pushbullet Pro");
          } else {
            return text("Pro");
          }
        });
      });
      row({
        icon: null,
        title: function() {
          return text("Send links");
        },
        regular: true,
        pro: true
      });
      row({
        icon: null,
        title: function() {
          return text("Send files");
        },
        regular: "up to 25MB",
        pro: "up to 1GB"
      });
      row({
        icon: "anroid",
        title: function() {
          return text("Storage space");
        },
        regular: "2GB",
        pro: "100GB"
      });
      row({
        icon: null,
        title: function() {
          return a({
            href: "/channels"
          }, function() {
            return text("Follow interesting things with Channels");
          });
        },
        regular: true,
        pro: true
      });
      row({
        icon: null,
        title: function() {
          return a({
            href: "https://blog.pushbullet.com/2015/08/11/end-to-end-encryption/"
          }, function() {
            return text("Optional end-to-end encryption");
          });
        },
        regular: true,
        pro: true
      });
      row({
        icon: null,
        title: function() {
          return a({
            href: "https://docs.pushbullet.com/"
          }, function() {
            return text("API access");
          });
        },
        regular: true,
        pro: true
      });
      row({
        icon: "android",
        title: function() {
          return text("Send messages (SMS, WhatsApp, Kik, etc)");
        },
        regular: "100/month",
        pro: "unlimited"
      });
      row({
        icon: "android",
        title: function() {
          return a({
            href: "https://blog.pushbullet.com/2014/01/24/sync-your-android-notification-drawer-with-your-computer/"
          }, function() {
            return text("Mirror your phone's notifications");
          });
        },
        regular: true,
        pro: true
      });
      row({
        icon: "android",
        title: function() {
          return a({
            href: "https://blog.pushbullet.com/2014/12/16/react-to-your-notifications-on-pc-with-new-quick-action-support/"
          }, function() {
            return text("Mirrored notification action support");
          });
        },
        regular: false,
        pro: true
      });
      return row({
        icon: "android",
        title: function() {
          return a({
            href: "https://blog.pushbullet.com/2014/08/20/introducing-universal-copy-and-paste/"
          }, function() {
            return text("Universal copy & paste");
          });
        },
        regular: false,
        pro: true
      });
    });
  };

  pb.pro.plan = "yearly";

  pb.pro.upgrading = false;

  pushbullet_pro_bar = function() {
    return div(function() {
      var bar;
      position("absolute");
      top(40);
      left(0);
      width("100%");
      font_size(26);
      color(colors.gray3);
      text_align("center");
      bar = function() {
        return div(function() {
          display("inline-block");
          background(colors.gray2);
          height(2);
          margin("6px 10px");
          if (window.innerWidth > 500) {
            return width(120);
          } else {
            return width(40);
          }
        });
      };
      bar();
      text("Pushbullet Pro");
      return bar();
    });
  };

  card = function() {
    div(function() {
      position("relative");
      margin("0px auto");
      margin_top(42);
      max_width(900);
      height(500);
      background_color("white");
      box_shadow("0 0 8px rgba(0,0,0,.06),0 4px 16px rgba(0,0,0,.12)");
      overflow("hidden");
      img({
        src: "/img/pro/raysbg.png",
        width: 900,
        height: 500
      }, function() {
        return position("absolute");
      });
      if (pb.pro.upgrading === "upgrading") {
        div(function() {
          position("relative");
          margin_top(175);
          text_align("center");
          font_size(30);
          z_index("1");
          icon(".icon-spinner.icon-spin");
          return text("Upgrading");
        });
        return;
      }
      if (pb.pro.upgrading === "done") {
        window.scrollTo(0, document.body.scrollHeight);
        pb.pro.upgrading = false;
      }
      pushbullet_pro_bar();
      div(function() {
        position("absolute");
        left(215);
        top(76);
        plan_card.yearly();
        return switcher("Pay Yearly", "yearly");
      });
      div(function() {
        position("absolute");
        left(476);
        top(76);
        plan_card.monthly();
        return switcher("Pay Monthly", "monthly");
      });
      return div(function() {
        position("absolute");
        top(330);
        width("100%");
        text_align("center");
        stripe_button();
        div(function() {
          return height(15);
        });
        return paypal_button();
      });
    });
    return div(function() {
      padding_top(13);
      line_height(18);
      margin_top(10);
      margin_bottom(32);
      color(colors.gray2);
      text_align('center');
      font_size(12);
      return refund_policy();
    });
  };

  plan_card = {
    yearly: function() {
      width(210);
      font_size(58);
      color(colors.gray3);
      div(function() {
        position("absolute");
        top(56);
        left(34);
        div(function() {
          float("left");
          return text("$3");
        });
        div(function() {
          float("left");
          font_size(34);
          margin_top(-7);
          return text("33");
        });
        return div(function() {
          float("left");
          font_size(34);
          return text("/mo");
        });
      });
      return div(function() {
        position("absolute");
        top(103);
        left(0);
        width(220);
        text_align("center");
        font_size(13);
        color(colors.gray3);
        font_weight("bold");
        return text("$39.99 per year");
      });
    },
    monthly: function() {
      width(210);
      font_size(58);
      color(colors.gray3);
      return div(function() {
        position("absolute");
        top(56);
        left(34);
        div(function() {
          float("left");
          return text("$4");
        });
        div(function() {
          float("left");
          font_size(34);
          margin_top(-7);
          return text("99");
        });
        return div(function() {
          float("left");
          font_size(34);
          return text("/mo");
        });
      });
    }
  };

  card_mobile = function() {
    min_width(300);
    section_heading("Pushbullet Pro");
    table("#mobile-card", function() {
      width("100%");
      tr(function() {
        td(function() {
          color("back");
          text_align('center');
          font_size(30);
          return text("$3.33/mo");
        });
        return td(function() {
          color("back");
          text_align('center');
          font_size(30);
          return text("$4.99/mo");
        });
      });
      tr(function() {
        td(function() {
          padding(10);
          text_align('center');
          font_size(14);
          return text("(39.99/yr)");
        });
        return td(function() {});
      });
      return tr(function() {
        td(function() {
          padding(5);
          text_align('center');
          return switcher_mobile("Pay Yearly", "yearly");
        });
        return td(function() {
          padding(5);
          text_align('center');
          return switcher_mobile("Pay Monthly", "monthly");
        });
      });
    });
    div(function() {
      margin(20);
      width("100%");
      text_align("center");
      stripe_button();
      div(function() {
        return height(15);
      });
      return paypal_button();
    });
    return div(function() {
      padding(10);
      max_width(500);
      margin("0px auto");
      text_align('center');
      color(colors.gray2);
      font_size(12);
      return refund_policy();
    });
  };

  refund_policy = function() {
    text("Don't worry, ");
    a({
      href: "/#settings/account"
    }, function() {
      return text("you can cancel");
    });
    text(" within 72 hours for a full refund.");
    br();
    text("By upgrading, you agree to our ");
    a({
      href: "/tos"
    }, function() {
      return text("Terms of Service");
    });
    return text(".");
  };

  stripe_mobile_button = function(label, plan) {
    if (pb.account == null) {
      return button(".green", function() {
        text_align("center");
        padding(10);
        font_weight("bold");
        text(label);
        return onclick(function() {
          return goto(mk_url("/signin", {
            next: "/pro"
          }));
        });
      });
    } else if (pb.account.pro) {
      return button(function() {
        text_align("center");
        padding(10);
        font_weight("bold");
        cursor("default");
        background_color(colors.white2);
        if (pb.account.plan_id === plan) {
          return text("Selected");
        } else {
          return text(label);
        }
      });
    } else {
      return button(".green", function() {
        text_align("center");
        padding(10);
        font_weight("bold");
        text(label);
        return onclick(function() {
          return stripe_popup(plan);
        });
      });
    }
  };

  switcher = function(label, plan) {
    return button(function() {
      position("absolute");
      top(165);
      width(220);
      height(43);
      text_align("center");
      line_height(26);
      padding(0);
      font_weight("bold");
      background_color(colors.gray1);
      color(colors.gray3);
      border_radius(30);
      div(function() {
        position("absolute");
        top(9);
        left(10);
        width(25);
        height(25);
        border_radius(25);
        if (pb.pro.plan === plan) {
          localStorage.proPlan = plan;
          background_color(colors.green1);
        } else {
          background_color("white");
        }
        return border("3px solid white");
      });
      text(label);
      return onclick(function() {
        return pb.pro.plan = plan;
      });
    });
  };

  switcher_mobile = function(label, plan) {
    return button(function() {
      position("relative");
      text_align("center");
      width(160);
      height(40);
      padding(0);
      font_weight("bold");
      font_size(14);
      background_color(colors.gray1);
      color(colors.gray3);
      border_radius(30);
      div(function() {
        position("absolute");
        top(8);
        left(7);
        width(25);
        height(25);
        border_radius(25);
        if (pb.pro.plan === plan) {
          localStorage.proPlan = plan;
          background_color(colors.green1);
        } else {
          background_color("white");
        }
        return border("3px solid white");
      });
      div(function() {
        position("absolute");
        top(9);
        left(45);
        return text(label);
      });
      return onclick(function() {
        return pb.pro.plan = plan;
      });
    });
  };

  stripe_button = function() {
    return button(".green", function() {
      var ref;
      position("relative");
      width(220);
      height(55);
      text_align("center");
      line_height(26);
      padding(0);
      font_weight("bold");
      if ((ref = pb.account) != null ? ref.pro : void 0) {
        background_color(colors.white2);
      }
      img({
        src: "/img/pro/card.png",
        width: 55,
        height: 55
      }, function() {
        position("absolute");
        top(0);
        return left(22);
      });
      div(function() {
        position("absolute");
        top(0);
        left(75);
        line_height(55);
        return text("Credit Card");
      });
      return onclick(stripe_click);
    });
  };

  stripe_click = function() {
    track("pro_button_click", {
      type: "stripe"
    });
    if (pb.account == null) {
      return goto(mk_url("/signin", {
        next: "/pro"
      }));
    } else if (pb.account.pro) {

    } else {
      return stripe_popup();
    }
  };

  paypal_button = function() {
    if (pb.pro.plan === "yearly") {
      return;
    }
    return button(".green", function() {
      var ref;
      position("relative");
      width(220);
      height(55);
      text_align("center");
      line_height(26);
      padding(0);
      font_weight("bold");
      if ((ref = pb.account) != null ? ref.pro : void 0) {
        background_color(colors.white2);
      }
      img({
        src: "/img/pro/paypal.png",
        width: 55,
        height: 55
      }, function() {
        position("absolute");
        top(0);
        return left(40);
      });
      div(function() {
        position("absolute");
        top(0);
        left(92);
        line_height(55);
        return text("PayPal");
      });
      return onclick(paypal_click);
    });
  };

  paypal_click = function() {
    track("pro_button_click", {
      type: "paypal"
    });
    if (pb.account == null) {
      return goto(mk_url("/signin", {
        next: "/pro"
      }));
    } else if (pb.account.pro) {

    } else {
      return pb.net.post('/v3/create-paypal-transaction', {
        plan: pb.pro.plan
      }, function(r) {
        var ref, ref1;
        if (r.redirect_url) {
          return goto(r.redirect_url);
        } else {
          pb.error.banner("PayPal error", (ref = r.error) != null ? ref.message : void 0);
          return track("paypal_transation_error", (ref1 = error.r.error) != null ? ref1.code : void 0);
        }
      });
    }
  };

  stripe_popup = function() {
    var amount, description, plan;
    if (typeof StripeCheckout === "undefined" || StripeCheckout === null) {
      track("pay_popup_error", {
        type: "stripe_undefined"
      });
      return;
    }
    plan = pb.pro.plan;
    track("pay_popup_open", {
      plan: pb.pro.plan
    });
    pb.pro.handler = StripeCheckout.configure({
      key: 'pk_live_QljACaGxpg9lvvROzqJajtWM',
      image: '/img/pro/marketplace.png',
      locale: 'auto',
      token: function(token) {
        pb.api.account.upgrade_pro(token.id, pb.pro.plan);
        pb.pro.upgrading = "upgrading";
        return onecup.refresh();
      }
    });
    if (plan === "yearly") {
      amount = 3999;
      description = 'yearly subscription';
    } else {
      amount = 499;
      description = 'monthly subscription';
    }
    return pb.pro.handler.open({
      name: 'Pushbullet.com',
      description: description,
      amount: amount,
      label: "Subscribe",
      email: pb.account.email,
      "panel-label": "Subscribe"
    });
  };

  twinkles = [[-324, 111], [-318, 241], [-402, 321], [-404, 168], [-387, 97], [-515, 167], [-560, 275], [-638, 294], [-644, 133], [-674, 66], [285, 241], [219, 189], [280, 115], [409, 116], [447, 239], [537, 313], [565, 366], [616, 208], [682, 118], [592, 72], [225, 144], [-719, 244], [-728, 162], [715, 283], [540, 190]];

  fancy_footer = function() {
    var pos;
    pos = function(x, y, z) {
      position("absolute");
      transform("translate(" + x + "px, " + y + "px)");
      return z_index("" + z);
    };
    return div("#fancy-footer", function() {
      height(550);
      width("100%");
      background(colors.white);
      overflow("hidden");
      return div(".middle", function() {
        var cloud;
        position("relative");
        width(0);
        height(714);
        margin("0 auto");
        background(colors.red);
        div(function() {
          var i, len, results, t;
          results = [];
          for (i = 0, len = twinkles.length; i < len; i++) {
            t = twinkles[i];
            results.push(img(".twinkle", {
              src: "/img/pro/footer/twinkle/01.png",
              width: "75px",
              height: "89px"
            }, function() {
              position("absolute");
              left(t[0]);
              return top(t[1]);
            }));
          }
          return results;
        });
        cloud = function(cls, d) {
          img(cls + ".a", {
            src: d.src,
            width: d.width,
            height: d.height
          }, function() {
            return pos(0, 550 - d.height, d.z);
          });
          return img(cls + ".b", {
            src: d.src,
            width: d.width,
            height: d.height
          }, function() {
            return pos(-950, 550 - d.height, d.z);
          });
        };
        cloud(".clouds1", {
          src: "/img/pro/footer/clouds3.png",
          width: 1000,
          height: 300,
          z: 1
        });
        cloud(".clouds2", {
          src: "/img/pro/footer/clouds2.png",
          width: 1000,
          height: 200,
          z: 2
        });
        cloud(".clouds3", {
          src: "/img/pro/footer/clouds1.png",
          width: 1000,
          height: 150,
          z: 4
        });
        img(".horay", {
          src: "/img/pro/footer/hooray.png",
          width: "184px",
          height: "177px"
        }, function() {
          return pos(320, 80, 3);
        });
        img(".unicorn", {
          src: "/img/pro/footer/unicorn.png",
          width: "431px",
          height: "496px"
        }, function() {
          return pos(250, 230, 3);
        });
        if (window.innerWidth > 540) {
          return img(".sun", {
            src: "/img/pro/footer/sun.png",
            width: "532px",
            height: "553px"
          }, function() {
            return pos(-553 / 2, 0, 0);
          });
        } else {
          return img(".sun", {
            src: "/img/pro/footer/sun.png",
            width: "232px",
            height: "253px"
          }, function() {
            return pos(-232 / 2, 0, 0);
          });
        }
      });
    });
  };


  /*
  footer_animate = ->
      move = (cls, speed) ->
          img = onecup.lookup(cls+".a")[0]
          return if not img
          x = (Date.now()/speed)%1000
          img.style.transform = "translate(#{x}px, #{550-img.height}px)"
          img = onecup.lookup(cls+".b")[0]
          x = (Date.now()/speed)%1000
          x -= 1000
          img.style.transform = "translate(#{x}px, #{550-img.height}px)"
  
      move(".clouds1", 100)
      move(".clouds2", 50)
      move(".clouds3", 25)
  
      requestAnimationFrame(footer_animate, 17)
  
  #footer_animate()
   */

  paypal_approval = "ready";

  views.paypal_payment_approve = function() {
    return div(function() {
      max_width(900);
      height(500);
      position("relative");
      margin("50px auto 200px auto");
      box_shadow("0 0 8px rgba(0,0,0,.06),0 4px 16px rgba(0,0,0,.12)");
      background_color("white");
      overflow("hidden");
      img({
        src: "/img/pro/raysbg.png",
        width: 900,
        height: 500
      }, function() {
        if (window.innerWidth < 900) {
          left(-(900 - window.innerWidth) / 2);
        }
        return position("absolute");
      });
      pushbullet_pro_bar();
      div(function() {
        position("relative");
        margin("100px auto 0px auto");
        return plan_card[localStorage.proPlan]();
      });
      return div(function() {
        position("absolute");
        top(260);
        left(0);
        width("100%");
        text_align("center");
        if (pb.account.pro || paypal_approval === "done") {
          return text("Thank you for upgrading to Pushbullet Pro!");
        } else {
          switch (paypal_approval) {
            case "ready":
              div(function() {
                margin(10);
                color(colors.gray3);
                font_size(14);
                if (localStorage.proPlan === "yearly") {
                  return text("You will be charged $39.99 now");
                } else {
                  return text("You will be charged $4.99 now");
                }
              });
              return button(".green", function() {
                text("Complete Purchase");
                return onclick(function() {
                  var op;
                  track("paypal_approve_click");
                  paypal_approval = "waiting";
                  op = {
                    type: "paypal",
                    paypal_token: onecup.params.token,
                    paypal_plan: localStorage.proPlan
                  };
                  return pb.net.post('/v3/upgrade-pro', op, function(r) {
                    var ref, ref1;
                    if (((ref = r.error) != null ? ref.message : void 0) != null) {
                      pb.error.banner("PayPal error", (ref1 = r.error) != null ? ref1.message : void 0);
                      return paypal_approval = "error";
                    } else {
                      track("paypal_approve_done");
                      return paypal_approval = "done";
                    }
                  });
                });
              });
            case "waiting":
              return text("Waiting...");
            case "error":
              return text("There was an error with PayPal. ");
          }
        }
      });
    });
  };

}).call(this);

//# sourceMappingURL=pro.js.map

// from 'src/views/main.js'
// Generated by CoffeeScript 1.10.0
(function() {
  var visibilitychange;

  pb.main = function() {
    var redirect_url, ref;
    pb.delete_mode = null;
    pb.rename_mode = null;
    pb.logging_in = false;
    pb.account = pb.db.get_simple("account");
    pb.extension = pb.db.get_simple("extension");
    pb.user = pb.db.get("user");
    if ((typeof location !== "undefined" && location !== null ? location.pathname : void 0) === "/widget.html") {
      tracking.visit("widget");
    } else {
      tracking.visit("visit");
    }
    if ((ref = pb.account) != null ? ref.api_key : void 0) {
      pb.api.start();
    }
    if ((typeof location !== "undefined" && location !== null ? location.pathname : void 0) !== "/widget.html" && (typeof location !== "undefined" && location !== null ? location.pathname : void 0) !== "/login-success") {
      pb.parse_auth_fragment();
      redirect_url = pb.db.get_simple("redirect_url");
      if (redirect_url) {
        pb.db.set_simple("redirect_url", false);
        goto(redirect_url);
      }
    }
    pb.sidebar.select_target(pb.db.get("sidebar_target"), false);
    if (window.location === null) {
      pb.error.banner("Extention conflict?", "window.location is null");
    }
    if (window.history === null) {
      return pb.error.banner("Extention conflict?", "window.history is null");
    }
  };

  visibilitychange = function() {
    if (document.visibilityState === "visible") {
      pb.api.fetch_all();
      return pb.api.devices.awake(true);
    }
  };

  document.addEventListener("visibilitychange", visibilitychange, false);

  window.addEventListener("mousemove", function(e) {
    return pb.api.devices.awake(true);
  });

  window.addEventListener("keypress", function(e) {
    return pb.api.devices.awake(true);
  });

  onecup.track_error(pb.main);

}).call(this);

//# sourceMappingURL=main.js.map

