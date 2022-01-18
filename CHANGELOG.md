# Puppeteer Prerender Plugin Changelog

This document only contains breaking changes

## 3.0.0

* Require `node >= 14`
* Always render home route `/` last if it exists
* Only one of `renderAfterEvent` or `renderAfterTime` can be set (previously if both are set, `renderAfterTime` is ignored)
* `PrerenderServer` is now an interface instead of abstract class
