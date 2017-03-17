# Contributing

## <a name="creating-issues"/></a> Creating Issues

To file bug reports and feature suggestions, use the ["Issues"](https://github.com/sidneys/pb-for-desktop/issues?q=is%3Aissue) page.

1. Make sure the issue has not been filed before.
1. Create a new issue by filling out [the issue form](https://github.com/sidneys/pb-for-desktop/issues/new).
1. If an issue requires more information and receives no further input, it will be closed.


## Creating Pull Requests

To create pull requests, use the ["Pull Requests"](https://github.com/sidneys/pb-for-desktop/pulls) page.

1. [Create a new Issue](#creating-issues) describing the Bug or Feature you are addressing, to let others know you are working on it.
1. If a related issue exists, add a comment to let others know that you'll submit a pull request.
1. Create a new pull request by filling out [the pull request form](https://github.com/sidneys/pb-for-desktop/pulls/compare).


### Setup

1. Fork the repository.
1. Clone your fork.
1. Make a branch for your change.
1. Run `npm install`.

## Commit Message

Use the AngularJS commit message format:

```
type(scope): subject
```

#### type
- `feat` New feature
- `fix` A bugfix
- `refactor` Code changes which are neither bugfix nor feature
- `docs`: Documentation changes
- `test`: New tests or changes to existing tests
- `chore`: Changes to tooling or library changes

#### scope
The context of the changes, e.g. `preferences-window` or `compiler`. Use consistent names.

#### subject
A **brief, yet descriptive** description of the changes, using the following format:

- present tense
- lowercase
- no period at the end
- describe what the commit does
- reference to issues via their id – e.g. `(#1337)`

