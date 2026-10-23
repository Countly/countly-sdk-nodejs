## XX.XX.XX
- Added the method `set_location` that sets the user's country code, city, GPS coordinates and IP address after init. When the session has already begun, or sessions are not tracked, the location is sent right away, otherwise with the session start. Every later request carries it, also those that cluster workers hand to the main process

## 26.8.0
- ! Minor breaking change ! SDK behavior settings are now enabled by default. Changes made in SDK Manager on your server affect the SDK's behavior directly and take precedence over the matching init options:
  - The SDK fetches the settings at start, every 4 hours by default and after a device ID change, also before consent is given, and stores them for the next start
- ! Minor breaking change ! The SDK now stores its data in a `.countly-storage` folder in the app's working directory:
  - Before, it used a `data` folder inside the SDK package, which every reinstall or upgrade of the package deleted, so the next start counted as a new user
  - Data at the old location is moved to the new folder once, at the first start, and the old files are kept with a `.migrated` suffix. If the new folder is not writable, the old location stays in use
  - A relative `storage_path` is now resolved against the app's working directory, and the files go inside the given folder also when the path has no trailing slash
  - CountlyBulk without `storage_path` now stores its data in `.countly-storage/bulk/<app_key>`
  - Add `.countly-storage/` to your `.gitignore`. Command line tools started from different folders and apps in containers should set an absolute `storage_path` to keep one device ID
  - The SDK prints a warning, also when logging is off, when the storage folder is not writable, for example on AWS Lambda, or is shared by two instances
- ! Minor breaking change ! The SDK now keeps the process running only while it has data to send and the server answers, so a script ends by itself once its data is delivered. Data that cannot be sent yet stays stored and is sent at the next start
- ! Minor breaking change ! With `track_errors`, unhandled promise rejections are now recorded as non-fatal errors, as the process keeps running after them. Uncaught exceptions are still recorded as fatal crashes
- ! Minor breaking change ! In a cluster, the workers and the main process now exchange messages that have a `cly` property. Your own `message` handlers receive them as well

- Added the init option `standalone_worker` that lets a cluster worker send its own data when the main process does not run the SDK, for example in PM2 cluster mode:
  - Each worker keeps its data in its own `worker-<number>` folder, numbered by PM2's instance number or else by the cluster worker ID
  - The cluster worker ID changes when a worker restarts, so pass `device_id` there to keep one device ID
- Added the init option `behavior_settings` for providing SDK behavior settings, in the format SDK Manager exports, until the first successful fetch
- Added the init option `disable_sdk_behavior_settings_updates` that stops fetching SDK behavior settings from the server. Stored and provided settings still apply
- Added SDK health check requests after init, also sent before consent is given. They can be turned off with the new init option `disable_health_check`
- Added an automatic backoff mechanism that by default pauses sending for 60 seconds after the server needed 10 seconds or more to answer. It can be turned off with the new init option `disable_backoff_mechanism`
- Added the init option `request_timeout` for setting, in seconds, how long a request waits for the server before it is sent again later (default 30, also for CountlyBulk)
- Added the method `flush` that sends all recorded data right away and resolves once it is delivered, for example before `process.exit()`
- A cluster worker whose main process does not run the SDK now prints a warning, also when logging is off, that its data is not sent
- CountlyBulk now prints a warning when `salt` is set
- Raw requests made with `request` now count towards the request queue size
- Queued requests are now sent one after another without waiting for the next heartbeat, also in CountlyBulk
- File storage now optimized for repeated writes
- The SDK now removes its process and cluster event listeners when `halt` is called

- Mitigated an issue where a missing storage file, which is normal at the first start, was logged as a warning
- Mitigated an issue where a request could be lost when the process ended while the request was being sent
- Mitigated an issue where calling `process.exit()` right after an SDK call could empty the storage file and lose the stored data and device ID
- Mitigated an issue where a BigInt value or a self-referencing object in recorded data crashed the app. BigInt values are now sent as text
- Mitigated an issue where a request that got no answer, or only part of one, stopped all further sending until the app restarted, also in CountlyBulk
- Mitigated an issue where CountlyBulk instances, and CountlyBulk next to the SDK, shared their storage, so data could be lost, sent twice or sent under the wrong app
- Mitigated an issue where removing consent was never sent to the server
- Mitigated an issue where a consent change made right before a device ID change, or before `flush` and `process.exit()`, was sent under the new device ID or lost
- Mitigated an issue where, after `change_id` without merge, the previous user's open view, unsaved custom properties, breadcrumbs and remote config values carried over to the wrong user
- Mitigated an issue where headers set in `http_options` made every GET request fail
- Mitigated an issue where internal limits were used wrongly
- Mitigated an issue where requests containing an apostrophe failed the checksum check of Countly 26.01 and newer servers when `salt` is set
- Mitigated an issue where a value containing half of an emoji could never be sent and stopped all further sending. Such characters are now sent as "�"
- Mitigated an issue where a CountlyBulk user created with `ip_address` threw an error on most calls
- Mitigated an issue where giving consent to a CountlyBulk user crashed the app when a call was waiting for that consent
- Mitigated an issue where the CountlyBulk `start` callback reported an empty queue while data was still unsent
- Mitigated an issue where calling `track_errors` repeatedly recorded each error several times
- Mitigated an issue where CountlyBulk replaced explicitly provided `hour`, `dow` and `tz` values of 0 with the current time in `add_request` and `add_bulk_request`
- Mitigated an issue where memory storage wrote files when a fatal crash was recorded

## 24.10.4
- Added a new init time flag `salt` for request tampering protection (should be used in tandem with server options)

## 24.10.3
- Added support for uploading user images by providing path to the local image using `picturePath` parameter in `user_details` method (non-bulk)
- Reduced SDK log verbosity

## 24.10.2
- Added timezone support for server

## 24.10.1
- Added a new method `set_id(newDeviceId)` for managing device ID changes according to the device ID Type
- Added `DeviceIdType` enums to be used to evaluate the device ID type.
- Added reserved keys for user properties

## 24.10.0
- Default max segmentation value count changed from 30 to 100
- Mitigated an issue where SDK could create an unintended dump file
- Added a new init time config option (conf.storage_type) which can make user set the SDK storage option:
  - File Storage
  - Memory Only Storage
- Added a new init time config option (conf.custom_storage_method) which enables user to provide custom storage methods

## 22.06.0
- Fixed a bug where remote config requests were rejected
- Fixed a bug where empty storage object did cause some issues

## 22.02.0
- !! Major breaking change !! Device ID provided during the init will be ignored if a device ID was provided previously
- Added a new init time flag which erases the previously stored device ID. This allows to set new device ID during init
- Added a call to get the device ID type of the user
- Added a call to get the device ID of the user 
- Now it appends the device ID type with each request

## 21.11.0
- !! Major breaking change !! Changing device ID without merging will now clear the current consent. Consent has to be given again after performing this action.
- ! Minor breaking change ! Multiple values now have a default limit adjustable at initialization:
  - Maximum size of all string keys is now 128 characters by default.
  - Maximum size of all values in key-value pairs is now 256 characters by default.
  - Maximum amount of segmentation in one event is mow 30 key-value pairs by default.
  - Maximum amount of breadcrumbs that can be recorded at once is now 100 by default.
  - Maximum stack trace lines per thread is now 30 by default.
  - Maximum stack trace line length is now 200 by default. 
- ! Minor breaking change ! After initialization, the logging/debugging mode can only be changed with `Countly.setLoggingEnabled` instead of `Countly.debug` now.
- When recording internal events with 'add_event', the respective feature consent will now be checked instead of just the 'events' consent. 
- Fixed a bug where the SDK throws a `Bulk user storage exception` due to a missing folder
- Increased the default max event batch size to 100.
- Logs are now color coded and indicate log levels.

## 20.11
- Add javascript flag to reported errors
- Added explicit remote-config consent
- Async writes with queue and lock
- Fixed bulk example
- Stricter Eslint rules

## 20.04
- Add basic performance trace reporting option
- Add method to report feedback directly without dialog (for custom UI)
- Allow providing custom segments for view tracking

## 19.08
- Allow overriding http options for each separate request to use proxy and other options

## 19.02
- Add remote config support
- Handle http request fail correctly
- Report unhandled rejections too

## 18.08
- Add crash log breadcrumb limit
- Allow unsetting custom property
- Empty event queue (into request queue) on device_id change (if user is not merged on server)
- Fixed consent check in Bulk Users
- Fixed consent check in Countly
- Fixed log for timed events
- Fixed logging in Bulk Users

## 18.04
- Add GDPR compliant consent management
- Allow providing path to storing internal data as initial configuration option
- Generate docs for CountlyBulk api
- Git ignore internally stored files

## 17.09
- Added bulk request processor for server to server data flow
- Synchronized persistent storage in some cases

## 17.05
- Do not override provided metrics
- Improved comments and docs

## 16.12.1
- Some minor changes

## 16.12
- Added new configuration options, as session_update and max_events, force_post
- Automatic switch to POST if amount of data can't be handled by GET
- Correctly handle ending session on device_id change without merge
- Additional checks preventing possible crashes
- Use unique millisecond timestamp for reporting

## 16.06
- First official release compatible with Countly Server 16.06 functionalities
