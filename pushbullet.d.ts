// TypeScript Type definitions for Pushbullet Web Client (https://pushbullet.com)
// sidneys
// https://github.com/sidneys/pb-for-desktop

/// <reference types="node" />

declare namespace Pushbullet {
  /**
   * Push Direction
   */
  enum MessageDirection {
    incoming = 'incoming',
    outgoing = 'outgoing',
    self = 'self',
  }

  /**
   * Base Push Types
   */
  enum PushType {
    Default = 'push',
    Note = 'note',
    Link = 'link',
    File = 'file',
  }

  /**
   * Image URLs
   */
  enum ImageUrl {
    Everything = '/img/deviceicons/everything.png',
    System = '/img/deviceicons/system.png',
    User = '/img/deviceicons/user.png',
    Phone = '/img/deviceicons/phone.png',
    Group = '/img/deviceicons/system.png'
  }

  /**
   * Ephemeral Types
   */
  enum EphemeralType {
    Sms = 'messaging_extension_reply',
    SmsChanged = 'sms_changed',
    Notification = 'mirror',
    Dismissal = 'dismissal',
    Clipboard = 'clip'
  }

  /**
   * Package Names
   */
  enum PackageName {
    Android = 'com.pushbullet.android',
  }

  /**
   * Package Names
   */
  enum URI {
    Api = 'https://api.pushbullet.com',
    Log = 'https://ocelot.pushbullet.com',
    Redirect = 'https://www.pushbullet.com/'
  }

  /**
   * Objects (such as pushes and devices) can be created, modified,
   * listed and deleted. All timestamps that appear on objects are
   * floating point seconds since the epoch, also called Unix Time.
   */
  interface Item {
    /**
     * Unique identifier for this object
     * Example: "ujpah72o0sjAoRtnM0jc"
     */
    iden: string
    /**
     * false if the item has been deleted
     * Example: true
     */
    active: boolean
    /**
     * Creation time in floating point seconds (unix timestamp)
     * Example: 1.381092887398433e+09
     */
    created: number
    /**
     * Last modified time in floating point seconds (unix timestamp)
     * Example: 1.441054560741007e+09
     */
    modified: number
  }

  /**
   * A Push.
   */
  interface Push extends Item {
    /**
     * Type of the push, one of "note", "file", "link".
     * Example: "note"
     */
    type: PushType
    /**
     * true if the push has been dismissed by any device or if any device
     * was active when the push was received
     * Example: false
     */
    dismissed: boolean
    /**
     * Unique identifier set by the client, used to identify a push in case you
     * receive it from /v2/everything before the call to /v2/pushes has completed.
     * This should be a unique value. Pushes with guid set are mostly idempotent,
     * meaning that sending another push with the same guid is unlikely to create
     * another push (it will return the previously created push).
     * Example: "993aaa48567d91068e96c75a74644159"
     */
    guid: string
    /**
     * Direction the push was sent in, can be "self", "outgoing", or "incoming"
     * Example: "self"
     */
    direction: MessageDirection
    /**
     * User iden of the sender
     * Example: "ujpah72o0"
     */
    sender_iden: string
    /**
     * Email address of the sender
     * Example: "elon@teslamotors.com"
     */
    sender_email: string
    /**
     * Canonical email address of the sender
     * Example: "elon@teslamotors.com"
     */
    sender_email_normalized: string
    /**
     * Name of the sender
     * Example: "Elon Musk"
     */
    sender_name: string
    /**
     * User iden of the receiver
     * Example: "ujpah72o0"
     */
    receiver_iden: string
    /**
     * Email address of the receiver
     * Example: "elon@teslamotors.com"
     */
    receiver_email: string
    /**
     * Canonical email address of the receiver
     * Example: "elon@teslamotors.com"
     */
    receiver_email_normalized: string
    /**
     * Device iden of the target device, if sending to a single device
     * Example: "ujpah72o0sjAoRtnM0jc"
     */
    target_device_iden: string
    /**
     * Device iden of the sending device. Optionally set by the sender when creating a push
     * Example: "ujpah72o0sjAoRtnM0jc"
     */
    source_device_iden: string
    /**
     * If the push was created by a client, set to the iden of that client.
     * Example: "ujpah72o0sjAoRtnM0jc"
     */
    client_iden: string
    /**
     * If the push was created by a channel, set to the iden of that channel
     * Example: "ujpah72o0sjAoRtnM0jc"
     */
    channel_iden: string
    /**
     * List of guids (client side identifiers, not the guid field on pushes)
     * for awake apps at the time the push was sent. If the length of this
     * list is > 0, dismissed will be set to true and the awake app(s) must
     * decide what to do with the notification
     * Example: ["web-2d8cdf2a2b9b","web-cdb2313c74e"]
     */
    awake_app_guids: string[]
    /**
     * Title of the push, used for all types of pushes
     * Example: "Space Travel Ideas"
     */
    title: string
    /**
     * Body of the push, used for all types of pushes
     * Example: "Space Elevator, Mars Hyperloop, Space Model S (Model Space?)
     */
    body: string
    /**
     * URL field, used for type="link" pushes
     * Example: "http://www.teslamotors.com/"
     */
    url: string
    /**
     * File name, used for type="file" pushes
     * Example: "john.jpg"
     */
    file_name: string
    /**
     * File mime type, used for type="file" pushes
     * Example: "image/jpeg"
     */
    file_type: string
    /**
     * File download url, used for type="file" pushes
     * Example: "https://dl.pushbulletusercontent.com
     * /foGfub1jtC6yYcOMACk1AbHwTrTKvrDc/john.jpg"
     */
    file_url: string
    /**
     * URL to an image to use for this push, present on
     * type="file" pushes if file_type matches image/*
     * Example: "https://lh3.googleuserconten.com
     * /mrrz35lLbiYAz8ejkJcpdsYhN3tMEtrXxj93k_gQPin4GfdD
     * jVy2Bj26pOGrpFQmAM7OFBHcDfdMjrScg3EUIJrgJeY"
     */
    image_url: string
    /**
     * Width of image in pixels, only present if image_url is set
     * Example: 322
     */
    image_width: number
    /**
     * Height of image in pixels, only present if image_url is set
     * Example: 484
     */
    image_height: number
  }

  /**
   * Chats are created whenever you send a message to someone or a receive
   * a message from them and there is no existing chat between you and the
   * other user.
   */
  interface Chat extends Item {
    /**
     * If true, notifications from this chat will not be shown
     * Example: false
     */
    muted: boolean
    /**
     * The user or email that the chat is with
     */
    with: {
      /**
       * If this is a user, the iden of that user
       * Example: "ujlMns72k"
       */
      iden: string
      /**
       * "email" or "user"
       * Example: "user"
       */
      type: ('email' | 'user')
      /**
       * Name of the person
       * Example: "John Carmack"
       */
      name: string
      /**
       * Email address of the person
       * Example: "carmack@idsoftware.com"
       */
      email: string
      /**
       * Canonical email address of the person
       * Example: "carmack@idsoftware.com"
       */
      email_normalized: string
      /**
       * Image to display for the person
       * Example: "https://dl.pushbulletusercontent.com
       * /foGfub1jtC6yYcOMACk1AbHwTrTKvrDc/john.jpg"
       */
      image_url: string
    }
  }

  /**
   * A Device.
   */
  interface Device extends Item {
    /**
     * Icon to use for this device, can be an arbitrary string.
     * Commonly used values are: "desktop", "browser", "website", "laptop", "tablet", "phone", "watch", "system"
     * Example: ios
     */
    icon?: string
    /**
     * Name to use when displaying the device
     * Example: "Elon Musk's iPhone"
     */
    nickname?: string
    /**
     * true if the nickname was automatically generated from the manufacturer and model fields (only used for some android phones)
     * Example: true
     */
    generated_nickname?: boolean
    /**
     * Manufacturer of the device
     * Example: "Apple
     */
    manufacturer?: string
    /**
     * Model of the device
     * Example: "iPhone 5s (GSM)"
     */
    model: string
    /**
     *  Version of the Pushbullet application installed on the device
     * Example: 8623
     */
    app_version?: number
    /**
     *  String fingerprint for the device, used by apps to avoid duplicate
     *  devices. Value is platform-specific.
     * Example: "nLN19IRNzS5xidPF+X8mKGNRpQo2X6XBgyO30FL6OiQ="
     */
    fingerprint?: string
    /**
     * Fingerprint for the device's end-to-end encryption key, used to
     * determine which devices the current device (based on its own
     * key fingerprint) will be able to talk to.
     * Example: "5ae6ec7e1fe681861b0cc85c53accc13bf94c11db7461a2808903f7469bfda56"
     */
    key_fingerprint?: string
    /**
     * Platform-specific push token. If you are making your own device, leave
     * this blank and you can listen for events on the Realtime Event Stream.
     * Example: "production:f73be0ee7877c8c7fa69b1468cde764f"
     */
    push_token?: (string | null)
    /**
     * true if the devices has SMS capability, currently only true for type="android" devices
     * Example: true
     */
    has_sms?: boolean
    /**
     * true if the devices has MMS capability, currently only true for type="android" devices
     * Example: true
     */
    has_mms?: boolean
    /**
     * @deprecated use {@link icon} field instead
     * Type of device, can be an arbitrary string.
     * Commonly used values are: "android", "chrome", "firefox", "ios", "windows", "stream", "safari", "mac", "opera", "website"
     */
    type?: string
    /**
     * @deprecated old name for {@link type}
     */
    kind?: string
    /**
     * @deprecated used to be for partially-initialized type="android" devices
     */
    pushable?: string
  }

  /**
   * Subscribe to channels to receive any updates pushed to that channel.
   * Channels can be created on the website. Each channel has a unique tag to identify it.
   * When you push to a channel, all people subscribed to that channel will receive a push.
   * To push to a channel, use the channel_tag parameter on create-push
   */
  interface Subscription extends Item {
    /**
     * If true, notifications from this chat will not be shown
     * Example: false
     */
    muted: boolean
    /**
     * Information about the channel that is being subscribed to
     */
    channel: {
      /**
       * Unique identifier for the channel
       * Example: "ujpah72o0sjAoRtnM0jc"
       */
      iden: string
      /**
       * Unique tag for this channel
       * Example: "elonmusknews"
       */
      tag: string
      /**
       * Name of the channel
       * Example: "Elon Musk News"
       */
      name: string
      /**
       * Description of the channel
       * Example: "News about Elon Musk."
       */
      description: string
      /**
       * Image for the channel
       * Example: "https://dl.pushbulletusercontent.com/StzRmwdkIe8gluBH3XoJ9HjRqjlUYSf4/musk.jpg"
       */
      image_url: string
      /**
       /**
       * Link to a website for the channel
       * Example: "https://twitter.com/elonmusk"
       */
      website_url: string
    }
  }

  /**
   * User
   */
  interface User extends Item {
    /**
     * Email address
     * Example: "elon@teslamotors.com"
     */
    email: string
    /**
     * Canonical email address
     * Example: "elon@teslamotors.com"
     */
    email_normalized: string
    /**
     * Full name if available
     * Example: "Elon Musk"
     */
    name: string
    /**
     * URL for image of user or placeholder image
     * Example: "https://static.pushbullet.com/missing-image/55a7dc-45"
     */
    image_url: string
    /**
     * Maximum upload size in bytes
     * Example: 26214400
     */
    max_upload_size: number
    /**
     * Number of users referred by this user
     * Example: 2
     */
    referred_count: number
    /**
     * 	User iden for the user that referred the current user, if set
     * Example: "ujlxm0aiz2"
     */
    referrer_iden: string
  }

  /**
   * OAuth Grants (Connected Apps)
   */
  interface Grant extends Item {
    client: {
      /**
       * Unique identifier for the grant
       * Example: "ujpah72o0sjAoRtnM0jc"
       */
      iden: string
      /**
       * Image for the grant
       * Example: "https://dl.pushbulletusercontent.com/StzRmwdkIe8gluBH3XoJ9HjRqjlUYSf4/musk.jpg"
       */
      image_url: string
      /**
       * Name of the grant
       * Example: "Elon Musk News"
       */
      name: string
      /**
       /**
       * Link to a website for the grant
       * Example: "https://twitter.com/elonmusk"
       */
      website_url: string
    }
  }

  /**
   * Text
   */
  interface Text extends Item {
    data: {
      /**
       * The iden of the device corresponding to the phone that should send the text.
       * Example: "ujpah72o0sjAoRtnM0jc"
       */
      target_device_iden: string
      /**
       * The phone numbers the text should be sent to.
       * Example: "000155533133"
       */
      addresses: string[]
      /**
       * The text message to send.
       * Example: "Hello!"
       */
      message: string
      /**
       * File mime type, used for type="file" pushes
       * Example: "image/jpeg"
       */
      file_type: string
    }
  }

  /**
   * You can send arbitrary JSON messages, called "ephemerals", to all
   * devices on your account. Ephemerals are stored for a short period of
   * time (if at all) and are sent directly to devices.
   */
  interface BaseEphemeral {
    /**
     * Must be set to push which is the only type of ephemeral currently.
     */
    type: "push"
    /**
     * true if the message is encrypted
     * Example: "MXAdvN64uXWtLXCRaqYHEtGhiogR1VHyXX21Lpjp4jv3v+JWygMBA9Wp5npbQdfeZAgOZI+JT3y3pbmq+OrKXrK1rg=="
     */
    encrypted?: boolean
    /**
     * Base64-Encoded JSON Object
     * Example: "MXAdvN64uXWtLXCRaqYHEtGhiogR1VHyXX21Lpjp4jv3v+JWygMBA9Wp5npbQdfeZAgOZI+JT3y3pbmq+OrKXrK1rg=="
     */
    ciphertext?: string
    /**
     * JSON Data
     * Example: "MXAdvN64uXWtLXCRaqYHEtGhiogR1VHyXX21Lpjp4jv3v+JWygMBA9Wp5npbQdfeZAgOZI+JT3y3pbmq+OrKXrK1rg=="
     */
    push?: (SmsEphemeral | SmsChangeEphemeral | NotificationEphemeral | DismissalEphemeral | ClipboardEphemeral)
  }

  /**
   * SMS Ephemeral
   */
  interface SmsEphemeral {
    /**
     * "messaging_extension_reply" for sending SMS.
     */
    type: EphemeralType.Sms
    /**
     * The user iden of the user sending this message.
     * Example: "ujpah72o0"
     */
    source_user_iden: string
    /**
     * "com.pushbullet.android" for sending SMS.
     */
    package_name: PackageName.Android
    /**
     * The iden of the device corresponding to the phone that should send the SMS.
     * Example: "ujpah72o0sjAoRtnM0jc"
     */
    target_device_iden: string
    /**
     * Phone number to send the SMS to.
     * Example: "+1 303 555 1212"
     */
    conversation_iden: string
    /**
     * The SMS message to send.
     * Example: "Hello!"
     */
    message: string
  }

  /**
   * SmS Change Ephemeral Data
   */
  interface SmsChangeEphemeral {
    /**
     * "clip" for clipboard messages.
     */
    type: EphemeralType.SmsChanged
    /**
     * The iden of the device sending this message.
     * Example: "ujpah72o0sjAoRtnM0jc"
     */
    source_device_iden: string
    /**
     * The iden of the device sending this message.
     * Example: "ujpah72o0sjAoRtnM0jc"
     */
    notifications: {
      /**
       * The SMS message text
       * Example: "Hello!"
       */
      body: string
      /**
       * The SMS messages' originating phone number
       * Example: "6505551212"
       */
      title: string
      /**
       * The SMS messages' timestamp
       * Example: 1546022176
       */
      timestamp: number
      /**
       * Unique identifier of the corresponding SMS message thread
       * Example: "3"
       */
      thread_id: string
    }
  }

  /**
   * Mirrored Notification Ephemeral
   */
  interface NotificationEphemeral {
    /**
     * "mirror" for mirrored notifications.
     */
    type: EphemeralType.Notification
    /**
     * The user iden of the user sending this message.
     * Example: "ujpah72o0"
     */
    source_user_iden: string
    /**
     * Base64-encoded JPEG image to use as the icon of the push.
     * Example: "/9j/4AAQSkZJRgABAQAA [..]"
     */
    icon: string
    /**
     * The title of the notification.
     * Example: "Mirroring test"
     */
    title: string
    /**
     * The body of the notification.
     * Example: "If you see this on your computer, Android-to-PC notifications are working!\n"
     */
    body: string
    /**
     * The iden of the device sending this message.
     * Example: "ujpah72o0sjAoRtnM0jc"
     */
    source_device_iden: string
    /**
     * The name of the application that created the notification.
     * Example: "Pushbullet"
     */
    application_name: string
    /**
     * True if the notification can be dismissed.
     * Example: true
     */
    dismissable: boolean
    /**
     * The package that made the notification, used when updating/dismissing an existing notification.
     * Example: "com.pushbullet.android"
     */
    package_name: string
    /**
     * The id of the notification, used when updating/dismissing an existing notification.
     * Example: "-8"
     */
    notification_id: string
    /**
     * The tag of the notification, used when updating/dismissing an existing notification.
     * Example: null
     */
    notification_tag: (string | null)
    /**
     * The phone is rooted.
     * Example: false
     */
    has_root: boolean
    /**
     * The client version of the app sending this message.
     * Example: 125
     */
    client_version: number
  }

  /**
   * Dismissal Ephemeral
   */
  interface DismissalEphemeral {
    /**
     * "dismissal" for notification dismissals.
     */
    type: EphemeralType.Dismissal
    /**
     * The user iden of the user sending this message.
     * Example: "ujpah72o0"
     */
    source_user_iden: string
    /**
     * Set to the package_name field from the mirrored notification.
     */
    package_name: string
    /**
     * Set to the notification_id field from the mirrored notification.
     * Example: "-8"
     */
    notification_id: string
    /**
     * Set to the notification_tag field from the mirrored notification.
     * Example: null
     */
    notification_tag: (string | null)
  }

  /**
   * Clipboard Ephemeral Data
   */
  interface ClipboardEphemeral {
    /**
     * "clip" for clipboard messages.
     */
    type: EphemeralType.Dismissal
    /**
     * The user iden of the user sending this message.
     * Example: "ujpah72o0"
     */
    source_user_iden: string
    /**
     * The text to copy to the clipboard.
     */
    body: string
    /**
     * The iden of the device sending this message.
     * Example: "ujpah72o0sjAoRtnM0jc"
     */
    source_device_iden: string
  }
}

/**
 * Pushbullet Web Client Interface via window.pb
 */
declare namespace PushbulletBrowserClient {
  interface Window {
    /**
     * window.pb
     */
    pb: {
      VERSION: number
      DEBUG: boolean
      API_SERVER: Pushbullet.URI.Api
      AUTH_REDIRECT_URI: Pushbullet.URI.Log
      LOG_SERVER: Pushbullet.URI.Log
      URLS: {
        android: 'https://play.google.com/store/apps/details?id=com.pushbullet.android&referrer=utm_source%3Dpushbullet.com'
        chrome: 'https://chrome.google.com/webstore/detail/chlffgpmiacpedhhbkiomidkjlcfhogd'
        firefox: 'https://addons.mozilla.org/en-US/firefox/addon/pushbullet/versions/'
        ios: 'https://itunes.apple.com/us/app/pushbullet/id810352052?ls=1&mt=8'
        mac: 'https://itunes.apple.com/us/app/pushbullet-from-pushbullet/id948415170?ls=1&mt=12'
        opera: 'https://addons.opera.com/en/extensions/details/pushbullet/'
        safari: 'http://update.pushbullet.com/extension.safariextz'
        windows: 'https://update.pushbullet.com/pushbullet_installer.exe'
      }
      session_id: string
      file_dragging: boolean
      in_frame: boolean
      PUSH_PER_PAGE: number
      show_pushes: number
      client_id: string
      stuff_loaded: boolean
      delete_mode: null
      rename_mode: null
      logging_in: boolean
      pro: {
        plan: string
        upgrading: boolean
      }
      db: {
        VERSION: number
        local_storage: boolean
      }

      channels: {
        uploading: boolean
        file_url: string
      }
      channel_create: {
        expanded: boolean
      }
      chats: {
        picker: Picker
      }
      everything: {
        modified_after: string
        cursor: {}
      }
      net: {
        API_VERSION: string
        USER_AGENT: string
      }
      header: {
        height: number
        navs: Array<[string, string]>
        mobile: boolean
      }
      path: string[]
      visit_info: {
        path: string
        referrer: string
        browser_name: string
        browser_version: string
        browser_mobile: boolean
        user_agent: string
        platform: string
        language: string
        encryption: boolean
      }
      browser: {
        name: string
        version: string
        mobile: boolean
      }
      setup: {
        invite_picker: Picker
        invite_emails: {}
      }
      account: Pushbullet.User
      pushbox: {
        target: object
        scroll_lock: boolean
        width_minibar: number
        width_sidebar: number
        width_mainbar: number
      }
      support: {
        email: string
        message: string
        message_sent: boolean
        guesses: object[]
        name: string
      }
      remotefiles: {
        view: string
        device_started: boolean
        popup: object
      }
      pushform: {
        target: object
        expanded: boolean
        type: string
        title?: string
        content?: string
        url?: string
        address?: string
        file_name: string
        file_url?: string
        file_type?: string
        file_progress: number
        message: string
        error_message: string
        waiting: boolean
        to_selection: number
        picker: {
          props: {
            direction: string
            placeholder: string
            clear_on_click: boolean
          }
          search?: string
          target: string
        }
        showing: boolean
      }
      search: {
        type: string
        q: string
      }
      targets: {
        delete_check_iden: string
        block_check_iden: string
      }
      sms: {
        q: string[]
        message_time_out: number
        count: number
        form_showing: boolean
        picker: Picker
        new_sms_picker: Picker
        target: object
        wants_thread_id: string
      }
      chat_heads: object
      clients: object
      oauth: object
      widget: object
      error: object
      pushes: object
      /**
       * Pushbullet Backend API Suites
       */
      api: {
        accounts: PushbulletApiSuite.AccountsApi
        devices: PushbulletApiSuite.DevicesApi
        grants: PushbulletApiSuite.GrantsApi
        pinger: PushbulletApiSuite.PingerSuite
        pushes: PushbulletApiSuite.PushesApi
        sms: PushbulletApiSuite.SmsApi
        text: PushbulletApiSuite.TextsApi
      },
      /**
       * E2E Utilities
       */
      e2e: {
        decrypt(encrypted: string): string
        enabled: boolean
        encrypt(plaintext: string): string
        error: boolean
        init(): void
        key_fingerprint: string
        set_password(plaintext: string): string
      }
    },
    /**
     * UI Utilities
     */
    onecup: {
      /**
       * Navigates to the given URL.
       */
      goto(url: string): void
      /**
       * Marks the UI as requiring a refresh.
       */
      refresh(): void
    }
    /**
     * Sidebar Utilities
     */
    sidebar: {
      needs_update: boolean
      /**
       * Marks the Sidebar as requiring a refresh.
       */
      update(): void
    },
    /**
     * SMS Utilities
     */
    sms: {
      message_time_out: 30000
      count: number
      form_showing: boolean
      picker: object
      send(message: string): void
      send_new(): void
      send_file(file: Pushbullet.Push): void
      target: {
        desc: string
        image_url: string
        info: {
          blurb: ""
          count: number
          recent: number
        }
        name: string
        obj: Pushbullet.Device
        type: string
        url: string
      }
    }
    /**
     * Websocket Utilities
     */
    ws: {
      last_message: 30000
      connected: boolean
      socket: WebSocket
    }

    /**
     * Push Targeting Utilities
     */
    targets: {
      block_check_iden: string
      by_device_iden(iden: string): Pushbullet.Item
      by_email(email: string): Pushbullet.Item
      by_tag(tag: string): Pushbullet.Item
      chats(): Pushbullet.Chat[]
      delete_check_iden: string
      devices: Pushbullet.Device[]
      generate(): void
      make(obj: Pushbullet.Item, force_type?: string): Pushbullet.Item
      make_ac_target(ac: Pushbullet.Chat): Pushbullet.Item
      make_email(email: string): Pushbullet.Item
      make_phone(phone: string): Pushbullet.Item
      match(target: object): boolean
      subscriptions(): Pushbullet.Item[]
    }

    /**
     * Generate Random Identifier
     */
    rand_iden(): string

    /**
     * Database Utilities
     */
    db: {
      VERSION: number
      local_storage: boolean
      check(): void
      clear(): void
      del_simple(key: string): void
      get(key: string): string
      get_simple(key: string): string
      set(key: string, data: any): void
      set_simple(key: string, data: any): void
      space(): void
      version_guard(): boolean
    }
  }

  /**
   * SMS Message Thread
   */
  interface SmsMessageRecipient {
    number: string
    name: string
    address: string
  }

  /**
   * SMS Message Thread
   */
  interface SmsMessageThread {
    /**
     * Unique identifier for this Thread
     */
    id: string
    /**
     * Latest SMS Message in Thread
     */
    latest: {
      type: 'sms'
      id: string
      guid: string
      body: string
      direction: Pushbullet.MessageDirection
      status: ('sent' | 'not sent')
      timestamp: number
    }
    recipients: SmsMessageRecipient[]
  }
}

interface Picker {
  props: {
    placeholder: string
    label: string
    direction: ('bottom' | 'top')
    clear_on_click: boolean
    phone_suggest?: boolean
    email_suggest?: boolean
    cb(): void
    [key: string]: any
  }
}

declare namespace PushbulletApiSuite {
  /**
   * Base API Suite
   */
  interface BaseApiSuite {
    type: string
    name: string
    nice_name: string
    uri: string
    all: (Pushbullet.Item[] | [])
    objs: { [key: string]: Pushbullet.Item[] }

    _load_storage(): void

    _save_storage(): void

    build_all(): void

    clear_error(): void

    create(item: BasePushCreationOptions | NoteCreationOptions | LinkCreationOptions | FileCreationOptions | Object): void

    delete(item: Pushbullet.Item): void

    new_item(push: Pushbullet.Item): void

    post_create(): void

    post_get(): void

    reset(): void

    save(): void

    set_all(items: Pushbullet.Item[]): void

    start(): void

    update(item: Pushbullet.Item): void

    new_obj: {}
    loaded: boolean
    getting: boolean
    creating: boolean
    updating: boolean
    deleting: boolean
    delete_check: boolean
    have_fetched: boolean
    modified_after: number
  }

  /**
   * Base Push Creation Options
   */
  interface BasePushCreationOptions {
    /**
     * Type of the push, one of "note", "file", "link".
     * Example: "note"
     */
    type: (Pushbullet.PushType | string)
    /**
     * Send the push to a specific device. Appears as target_device_iden on the push.
     */
    device_iden?: string
    /**
     *  Send the push to this email address. If that email address is associated with
     *  a Pushbullet user, we will send it directly to that user, otherwise we will
     *  fallback to sending an email to the email address (this will also happen if
     *  a user exists but has no devices registered).
     */
    email?: string
    /**
     * Send the push to all subscribers to your channel that has this tag.
     */
    channel_tag?: string
    /**
     * Send the push to all users who have granted access to your OAuth client that has this iden.
     */
    client_iden?: string
    /**
     * A message associated with the push.
     */
    body: string
  }

  /**
   * Note Creation Options
   */
  interface NoteCreationOptions extends BasePushCreationOptions {
    /**
     * The note's title.
     */
    title: string
  }

  /**
   * Link Creation Options
   */
  interface LinkCreationOptions extends BasePushCreationOptions {
    /**
     * The link's title.
     */
    title: string
    /**
     * URL field, used for type="link" pushes
     * Example: "http://www.teslamotors.com/"
     */
    url: string
  }

  /**
   * File Creation Options
   */
  interface FileCreationOptions extends BasePushCreationOptions {
    /**
     * The name of the file.
     * Example: "john.jpg"
     */
    file_name: string
    /**
     * The MIME type of the file.
     * Example: "image/jpeg"
     */
    file_type: string
    /**
     * The url for the file. See pushing files for how to get a file_url
     * Example: "https://dl.pushbulletusercontent.com/foGfub1jtC6yYcOMACk1AbHwTrTKvrDc/john.jpg"
     */
    file_url: string
  }

  /**
   * Pushes API
   */
  interface PushesApi extends BaseApiSuite {
    type: (Pushbullet.PushType | string)
    name: "pushes"
    nice_name: "Push"
    uri: "/v2/pushes"
    default_image_url: Pushbullet.ImageUrl.Everything
    queue: Pushbullet.Push[]
    error_queue: Pushbullet.Push[]
    file_queue: Pushbullet.Push[]
    dismissing: { [key: string]: boolean[] }
    notified_push_idens: string[]

    add_target(push: Pushbullet.Push): void

    delete_all(): void

    dismiss(push: Pushbullet.Push): void

    do_file_queue(): void

    do_push_queue(): void

    notified(): void

    notify_after: boolean

    post_get(): void

    queue_push(push: Pushbullet.Push): void

    remove_from_error_queue(push: Pushbullet.Push): void

    remove_from_file_queue(push: Pushbullet.Push): void

    remove_from_queue(push: Pushbullet.Push): void

    retry_send(push: Pushbullet.Push): void

    send(): void

    send_file(): void

    should_notify(): void

    start(): void

    upload_abort(push: Pushbullet.Push): void

    upload_file(file: string, callback: Function): void

    upload_file_finish(upload: object, push: Pushbullet.Push): void

    upload_file_parts(upload: object, push: Pushbullet.Push, index: number): void

    upload_push(push: Pushbullet.Push): void
  }

  /**
   * SMS API
   */
  interface SmsApi extends BaseApiSuite {
    default_image_url: Pushbullet.ImageUrl.User
    default_group_image_url: Pushbullet.ImageUrl.Group
    thread: Pushbullet.SmsEphemeral[]
    threads: Pushbullet.SmsEphemeral[]

    fetch_device(): void

    fetch_thread(): void

    first_sms_device(): Pushbullet.Device

    get_phonebook(): void

    phonebook_cache: {}

    set_limit(limit: number): void

    start(): void

    tickle(): void
  }

  /**
   * Accounts API
   */
  interface AccountsApi extends BaseApiSuite {
    type: "account"
    default_image_url: Pushbullet.ImageUrl.User
    name: "accounts"
    nice_name: "Account"
    uri: "/v2/accounts"

    fetch_device(): void

    fetch_thread(): void

    get_phonebook(): void

    phonebook_cache: {}

    set_limit(limit: number): void

    start(): void

    tickle(): void
  }

  /**
   * Devices API
   */
  interface DevicesApi extends BaseApiSuite {
    type: "device"
    default_image_url: Pushbullet.ImageUrl.Phone
    name: "devices"
    nice_name: "Device"
    uri: "/v2/devices"
    last_awake_time: number
    last_awake_state: boolean

    is_awake(): boolean

    awake(state: boolean): void

    guess_icon(device: Pushbullet.Device): string
  }

  /**
   * Texts API
   */
  interface TextsApi extends BaseApiSuite {
    type: "text"
    name: "texts"
    nice_name: "Text"

    send(device: Pushbullet.Device, addresses: string[], message: string, guid: string, thread_id: string, file_type: string, file_url: string): boolean
  }

  /**
   * Grants API
   */
  interface GrantsApi extends BaseApiSuite {
    type: "grant"
    name: "grants"
    nice_name: "OAuth Grant"
    default_image_url: Pushbullet.ImageUrl.System
    uri: "/v2/grants"

    by_client_iden(iden: string): Pushbullet.Grant
  }

  /**
   * Account API
   */
  interface Account {
    last_active: number
    preferences: {}

    track_active(): void

    start(): void

    get(): void

    save(): void

    set(account: object): void

    delete(): void

    delete_all_access_tokens(): void

    create_access_token(): void

    setup_done(type: string): void

    setup_restart(type: string): void

    load_preferences(): void

    migrate_preferences(): void

    save_preferences(): void

    upgrade_pro(token_id: string, plan_id: string): void

    downgrade_pro(): void;
  }

  /**
   * Pinger Suite
   */
  interface PingerSuite {
    online: {}
    last_ping_time: number

    pong_iden(device_iden: string): void

    ping_all(): void
  }
}
