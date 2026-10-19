## Next Release
- ! Minor breaking change ! The SDK now stores its data (device ID, unsent requests and events) in a ".countly-storage" folder in the app's working directory:
  - Before, it used a "data" folder inside the SDK package, which every reinstall or upgrade of the package deleted, so the next start became a new user
  - A relative "storage_path" is now resolved against the app's working directory instead of the SDK's own folder
  - Files are stored inside the given "storage_path" folder also when the path has no trailing slash
  - Data found at the old location is moved to the new one once, and the old files are kept with a ".migrated" suffix. If the new folder is not writable, the old location stays in use
  - CountlyBulk with file storage and no "storage_path" now stores its data in ".countly-storage/bulk/<app_key>"
  - Add ".countly-storage/" to your ".gitignore". Command line tools started from different folders, and containers, should set an absolute "storage_path" (for example a folder in the user's home or a mounted volume) to keep one device ID
  - The SDK now prints a warning, also when logging is off, when the storage folder is not writable (for example on read-only file systems such as AWS Lambda) and when two instances of the same kind store their files in the same folder
- ! Minor breaking change ! The SDK now keeps the Node.js process running only while it has data to send and the server is answering. A script that records data now ends by itself once the data is delivered; data that cannot be sent yet stays stored and is sent on the next start
- ! Minor breaking change ! Requests now fail when the server sends nothing for 30 seconds, and are sent again later. The time can be set with the new "request_timeout" init option, in seconds (also for CountlyBulk)
- ! Minor breaking change ! With "track_errors", an unhandled promise rejection is now recorded as a non-fatal error, as the process keeps running after it. Uncaught exceptions are still recorded as fatal crashes
- ! Minor breaking change ! Changing the device ID without merge now also:
  - Clears the stored remote config values, breadcrumbs and calls waiting for consent
  - Sends the previous user's open view duration and unsaved custom property changes under the previous ID before switching
  - Ignores remote config values that were still downloading for the previous device ID. The "fetch_remote_config" callback then gets an error
- ! Minor breaking change ! In a cluster, a worker now asks the main process once whether it runs the SDK, and the main process answers. These messages have a "cly" property, and your own "message" handlers in the main process and in workers receive them as well
- ! Minor breaking change ! Added SDK behavior settings. The SDK now fetches the settings set in the dashboard's SDK Manager at start, every 4 hours (or at the refresh interval set there) and after a device ID change, and follows them:
  - The settings can turn off all tracking, all sending, or sessions, views, custom events, crashes and location one by one, change the queue, batch and length limits, and turn the consent requirement on or off, also one set with "require_consent", as on Android and Web. Without that setting the "require_consent" value applies
  - A setting set in SDK Manager takes precedence over the matching init option. A setting removed there goes back to the init option, or else to the default
  - The fetched settings are stored and used from the next start on, also before the server answers. The new init option "behavior_settings" provides settings, in the format SDK Manager exports, for the time before the first successful fetch
  - While tracking is turned off nothing new is recorded, including consent changes and "request" calls, and data recorded before is still sent. While sending is turned off data is kept and sent once sending is turned on again, "flush" resolves false right away and "fetch_remote_config" calls its callback with an error
  - The settings request is sent also when consent is required and not given, and while sending is turned off, so that changes reach the SDK. Set the new init option "disable_sdk_behavior_settings_updates" to not fetch the settings; stored and provided settings still apply
  - After a device ID change with merge, the settings are fetched once the merge request is delivered
- ! Minor breaking change ! Added a health check. Once per start, after the settings fetch, the SDK sends the number of errors and warnings it logged (also when logging is off), the status code and the first 1000 characters of the answer of the last request the server refused, and how often sending paused, together with the app version. The numbers are kept until the server confirms them. The health check is sent also when consent is required and not given, and not while sending is turned off. Set the new init option "disable_health_check" to not send it
- ! Minor breaking change ! After a request the server answered slowly (in 10 seconds or more by default), the SDK now pauses sending for 60 seconds when the queue is at most half full and the request was recorded within the last 24 hours, so that a busy server can recover. SDK Manager can change these values, and "flush" does not wait for the pause. Set the new init option "disable_backoff_mechanism" to never pause
- SDK Manager can now set a maximum age for queued requests. Older requests are then dropped instead of sent, and a "flush" call waiting for them resolves false. This is off by default
- A missing storage file, which is normal before the SDK first writes it, is no longer logged as a warning
- The npm package now contains only the SDK code, README, LICENSE and CHANGELOG. Tests, examples and repository configuration files are no longer included
- Added a new method "flush" that sends all recorded data right away and tells when it is delivered, for example before a script ends or in a shutdown handler before "process.exit()"
- Added a new init time flag "standalone_worker" that lets a cluster worker send its own data when the main process does not run the SDK, for example in PM2 cluster mode:
  - Each worker stores its data in its own "worker-<number>" folder, numbered by PM2's instance number, or else by the cluster worker ID
  - The cluster worker ID changes when a worker is restarted, so pass "device_id" to keep one ID
- A cluster worker whose main process does not run the SDK now prints a warning that its data is not sent, also when logging is off
- CountlyBulk now prints a warning when "salt" is set, as Countly servers drop bulk data of apps that have a salt configured
- Fixed a bug where one request that got no answer, or whose answer was cut off, stopped all further sending until the app restarted (also in CountlyBulk)
- Fixed a bug where calling "process.exit()" right after an SDK call could leave the storage file empty and lose all stored data or the device ID. Files are now replaced in one step, and data not yet written is saved when the process exits
- Fixed a bug where a request was removed from the stored queue before the server confirmed it, so it was lost if the process ended meanwhile
- Fixed a bug where creating a CountlyBulk instance changed where, or whether, the SDK and other CountlyBulk instances stored their data, and where two CountlyBulk instances could send each other's data under the wrong app
- Fixed a bug where removing consent was never reported to the server
- Fixed a bug where a consent change made less than a second before a device ID change was reported under the new device ID or not at all, and where a consent change made right before "flush" and "process.exit()" was lost. Such a change is now sent right away, under the device ID of the user who made it
- Fixed a bug where consent changes of CountlyBulk users were never sent
- Fixed a bug where a BigInt value or an object that refers to itself in event, view, user property or crash data crashed the app. BigInt values are now sent as text and self references are left out
- Fixed a bug where "change_id" with an empty value stopped all tracking. Such values are now ignored with a warning, and an empty device ID stored by an older version is ignored at start
- Fixed a bug where the previous user's open view, custom property changes and breadcrumbs were sent under the new device ID after "change_id" without merge
- Fixed a bug where headers added in "http_options" made every GET request fail, so nothing was sent
- Fixed a bug where "request" cut every value to 256 characters, which broke raw event and user payloads. Raw requests now also count towards the request queue size
- Fixed a bug where requests containing an apostrophe failed the checksum check of Countly 26.01 and newer servers when "salt" is set. The characters ! ' ( ) * are now percent-encoded
- Fixed a bug where a value containing half of an emoji, for example a device ID cut in the middle of an emoji, could never be sent and stopped all further sending, also after a restart. Such half characters are now sent as the replacement character "�"
- Fixed a bug where the key length and segmentation limits also cut Countly's own events, so the server no longer recognized them. For example, with a key length limit of 8 a view was sent as "[CLY]_vi". Views, star ratings, feedback and other internal events now keep their key and segmentation; the segmentation given to "track_view" is still limited
- Fixed a bug where a CountlyBulk user created with "ip_address" threw an error on most calls
- Fixed a bug where giving consent to a CountlyBulk user after a "begin_session" or "report_view" call that waited for consent crashed the app. The waiting call is now sent
- Fixed a bug where the CountlyBulk "start" callback reported an empty queue while data was still waiting for a retry or being sent
- Queued requests are now sent one after another without waiting for the next heartbeat, and all recorded events are packed into requests at each heartbeat (also in CountlyBulk)
- File storage now combines repeated writes of the same data, so a busy app no longer rewrites the whole queue file for every recorded item
- Memory storage no longer writes files when a fatal crash is recorded
- Requests that were running when "halt" was called no longer change the SDK's state afterwards
- Fixed a bug where calling "track_errors" repeatedly would register duplicate error handlers, causing a single error to be recorded multiple times
- Fixed a bug in CountlyBulk where explicitly provided "hour", "dow" and "tz" values of 0 were overridden with current time values in "add_request" and "add_bulk_request"
- SDK now removes its process and cluster event listeners when "halt" is called

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
