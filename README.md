# Countly NodeJS SDK 
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/e68f25fa4a9b4990bdb213554901728b)](https://www.codacy.com/app/ar2rsawseen/countly-sdk-nodejs?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=Countly/countly-sdk-nodejs&amp;utm_campaign=Badge_Grade) 
[![npm version](https://badge.fury.io/js/countly-sdk-nodejs.svg)](https://badge.fury.io/js/countly-sdk-nodejs) 
[![Inline docs](https://inch-ci.org/github/Countly/countly-sdk-nodejs.svg?branch=master)](https://inch-ci.org/github/Countly/countly-sdk-nodejs)

## What's Countly?
[Countly](https://count.ly) is an innovative, real-time, open source mobile & [web analytics](https://count.ly/web-analytics), [rich push notifications](https://count.ly/push-notifications) 
and [crash reporting](https://count.ly/crash-reports) platform powering more than 2500 web sites and 14000 mobile applications as of 2017 Q3. 
It collects data from mobile phones, tablets, Apple Watch and other internet-connected devices, and visualizes this information to analyze application usage and end-user behavior. 

With the help of [Javascript SDK](https://github.com/countly/countly-sdk-web), Countly is a web analytics platform with features on par with mobile SDKs. For more information about web analytics capabilities, [see this link](https://count.ly/web-analytics).

There are two parts of Countly: the server that collects and analyzes data, and an SDK (mobile, web or desktop) that sends this data. This repository includes Countly Community Edition (server side). For more information other versions (e.g Enterprise Edition), see [comparison of different Countly editions](https://count.ly/compare)

* **Slack user?** [Join our Slack community](https://slack.count.ly/)
* **Questions?** [Ask in our Community forum](https://support.count.ly/hc/en-us/community/topics)

## About

This repository includes the Countly NodeJS SDK.

Need help? See [Countly SDK for NodeJS](https://support.count.ly/hc/en-us/articles/360037442892-NodeJS-SDK) SDK integration at [Countly Resources](https://support.count.ly/hc/en-us)  or [Countly NodeJS SDK Documentation](https://countly.github.io/countly-sdk-nodejs/)

## How to get Countly NodeJS SDK?

Currently in testing phase

```shell
npm install countly-sdk-nodejs
```

or

```shell
yarn add countly-sdk-nodejs
```

## How to use Countly NodeJS SDK?

```JS
var Countly = require('countly-sdk-nodejs');

Countly.init({
    app_key: "{YOUR-API-KEY}",
    url: "https://try.count.ly/",
    debug: true
});


Countly.begin_session();

Countly.add_event({
    "key": "in_app_purchase",
    "count": 3,
    "sum": 2.97,
    "dur": 1000,
    "segmentation": {
        "app_version": "1.0",
        "country": "Turkey"
    }
});
```

More information is available at [https://support.count.ly/hc/en-us/articles/360037442892-NodeJS-SDK](https://support.count.ly/hc/en-us/articles/360037442892-NodeJS-SDK)

### Other Github resources

Check Countly Server source code here: 

* [Countly Server](https://github.com/Countly/countly-server)

There are also other Countly SDK repositories below:

* [Countly iOS SDK](https://github.com/Countly/countly-sdk-ios)
* [Countly Android SDK](https://github.com/Countly/countly-sdk-android)
* [Countly Windows Phone SDK](https://github.com/Countly/countly-sdk-windows-phone)
* [Countly Web SDK](https://github.com/Countly/countly-sdk-web)
* [Countly Appcelerator Titanium SDK](https://github.com/euforic/Titanium-Count.ly) (Community supported)
* [Countly Unity3D SDK](https://github.com/Countly/countly-sdk-unity) (Community supported)

### How can I help you with your efforts?

Glad you asked. We need ideas, feedbacks and constructive comments. All your suggestions will be taken care with upmost importance. We are on [Twitter](https://twitter.com/gocountly) and [Facebook](https://www.facebook.com/Countly) if you would like to keep up with our fast progress!

If you like Countly, why not use one of our badges and give a link back to us, so others know about this wonderful platform? 

<a href="https://count.ly/f/badge" rel="nofollow"><img style="width:145px;height:60px" src="https://count.ly/badges/dark.svg?v2" alt="Countly - Product Analytics" /></a>

```JS
<a href="https://count.ly/f/badge" rel="nofollow"><img style="width:145px;height:60px" src="https://count.ly/badges/dark.svg" alt="Countly - Product Analytics" /></a>
```

<a href="https://count.ly/f/badge" rel="nofollow"><img style="width:145px;height:60px" src="https://count.ly/badges/light.svg?v2" alt="Countly - Product Analytics" /></a>

```JS
<a href="https://count.ly/f/badge" rel="nofollow"><img style="width:145px;height:60px" src="https://count.ly/badges/light.svg" alt="Countly - Product Analytics" /></a>
```

### Support

For community support page, see [https://support.count.ly/hc/en-us/community/topics](https://support.count.ly/hc/en-us/community/topics "Countly Support").

[![NPM](https://nodei.co/npm/countly-sdk-nodejs.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/countly-sdk-nodejs/)
