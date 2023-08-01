# Puppeteer Prerender Plugin Changelog

This document only contains breaking changes

## 3.0.12

* Renamed options in `SpaServerOptions` (this is an internal module that nobody should be using but is still exported)
    * `entryFile` renamed to `entryFilePath` (need to be full path instead of just file name)
    * `staticDir` renamed to `publicDir`

## 3.0.8

* Removed `VueSsgServer` (it was technically an internal module so nobody should be using it anyways)

## 3.0.0

* Require `node >= 14`
* Always render home route `/` last if it exists
* Only one of `renderAfterEvent` or `renderAfterTime` can be set (previously if both are set, `renderAfterTime` is ignored)
* `PrerenderServer` is now an interface instead of abstract class
