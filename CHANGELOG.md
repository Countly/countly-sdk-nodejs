## 21.11.0
- !! Major breaking change !! Changing device ID without merging will now clear the current consent. Consent has to be given again after performing this action.
- ! Minor breaking change ! After initialization, the logging/debugging mode can only be changed with `Countly.setLoggingEnabled` instead of `Countly.debug` now.
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
