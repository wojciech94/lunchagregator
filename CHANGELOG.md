# Changelog

## [0.8.0](https://github.com/wojciech94/lunchagregator/compare/v0.7.1...v0.8.0) (2026-10-09)


### Features

* **menu:** automatic recurring lunch menus with schedules and day exceptions ([#139](https://github.com/wojciech94/lunchagregator/issues/139)) ([06a6be4](https://github.com/wojciech94/lunchagregator/commit/06a6be4999cf3395cc4cbb554c100178837d9d3a))
* **menu:** automatic recurring lunch menus with schedules and day exceptions ([#139](https://github.com/wojciech94/lunchagregator/issues/139)) ([403631c](https://github.com/wojciech94/lunchagregator/commit/403631cf0a1339e6e17a8853a31b10f04ce0e3aa))

## [0.7.1](https://github.com/wojciech94/lunchagregator/compare/v0.7.0...v0.7.1) (2026-10-09)


### Bug Fixes

* retain Meatologia AI failure diagnostics and street alias ([0f53b7c](https://github.com/wojciech94/lunchagregator/commit/0f53b7c3dcc6636a9c096b6b7874d049b75d2818))

## [0.7.0](https://github.com/wojciech94/lunchagregator/compare/v0.6.0...v0.7.0) (2026-10-09)


### Features

* pilot Meatologia image menus through verified Admin imports ([f09bb7a](https://github.com/wojciech94/lunchagregator/commit/f09bb7a3b41c40c28c39355fd9412d7cdb59d37e))

## [0.6.0](https://github.com/wojciech94/lunchagregator/compare/v0.5.0...v0.6.0) (2026-10-09)


### Features

* **import:** onboard verified generic HTML source pilots ([d3b5ee9](https://github.com/wojciech94/lunchagregator/commit/d3b5ee90dedcbf240b9a8f025b426a25ab51f694))

## [0.5.0](https://github.com/wojciech94/lunchagregator/compare/v0.4.2...v0.5.0) (2026-10-09)


### Features

* **import:** configure verified sources from Restaurant details ([#128](https://github.com/wojciech94/lunchagregator/issues/128)) ([3c7a77d](https://github.com/wojciech94/lunchagregator/commit/3c7a77de4993f74b8a836ddd0cf9943bedbb96c8))
* **import:** manage verified Restaurant source bindings ([#128](https://github.com/wojciech94/lunchagregator/issues/128)) ([6cab83d](https://github.com/wojciech94/lunchagregator/commit/6cab83db0914efa6041623bb9b70de61232fa3d5))


### Bug Fixes

* **import:** audit source binding mutations atomically ([1ada5cb](https://github.com/wojciech94/lunchagregator/commit/1ada5cb1f8ce05c9cc1a9e4a04a2c5ba31103207))

## [0.4.2](https://github.com/wojciech94/lunchagregator/compare/v0.4.1...v0.4.2) (2026-10-09)


### Bug Fixes

* recheck PR revision after fetching bot reviews ([474423a](https://github.com/wojciech94/lunchagregator/commit/474423a4f8de42052475078eebe359ddd9370878))

## [0.4.1](https://github.com/wojciech94/lunchagregator/compare/v0.4.0...v0.4.1) (2026-10-08)


### Bug Fixes

* **import:** validate preview freshness using server time ([3c7532f](https://github.com/wojciech94/lunchagregator/commit/3c7532f54329209038f9af0a629b102a7f1ee70f))

## [0.4.0](https://github.com/wojciech94/lunchagregator/compare/v0.3.0...v0.4.0) (2026-10-08)


### Features

* **import:** approve and publish menus with atomic idempotency ([e2aa198](https://github.com/wojciech94/lunchagregator/commit/e2aa198613385cca51d9c0fbaec697462dec8c85))
* **import:** approve menu publication with safe retries ([#94](https://github.com/wojciech94/lunchagregator/issues/94)) ([2f8415a](https://github.com/wojciech94/lunchagregator/commit/2f8415a23b1613a34946b98af04017e970f76955))


### Bug Fixes

* **ci:** classify both paths when files are renamed ([304a49e](https://github.com/wojciech94/lunchagregator/commit/304a49e438d1837f2a004a45903c3978b1799ede))

## [0.3.0](https://github.com/wojciech94/lunchagregator/compare/v0.2.0...v0.3.0) (2026-10-08)


### Features

* **import:** preview Sofa and Sushi Friends menus for admins ([7465a4a](https://github.com/wojciech94/lunchagregator/commit/7465a4ae8da029fb2dd00a0a3447ff0454380af0))
* **import:** preview Sofa and Sushi Friends menus in admin ([#94](https://github.com/wojciech94/lunchagregator/issues/94)) ([f01072f](https://github.com/wojciech94/lunchagregator/commit/f01072fdfd9056c39f674435cb0d12acfb912f17))


### Bug Fixes

* **import:** preserve HTML previews beyond the AI input limit ([e10d961](https://github.com/wojciech94/lunchagregator/commit/e10d961c7244268af2e899d448786e389d204f19))

## [0.2.0](https://github.com/wojciech94/lunchagregator/compare/v0.1.0...v0.2.0) (2026-10-08)


### Features

* **account:** automate release versions and show build identity beside logout ([b7628f0](https://github.com/wojciech94/lunchagregator/commit/b7628f0f778ea854182f90b862d242a52692e7ef))
* **account:** track app builds and automate release versions ([b662370](https://github.com/wojciech94/lunchagregator/commit/b662370015124a0f75e824dd7bccd24ff687f78a))
* **chat:** recommend lunch offers for requested dates and weeks ([2b02baa](https://github.com/wojciech94/lunchagregator/commit/2b02baa77be087add8f25f30983d2d9992535de3))


### Bug Fixes

* **build:** share version snapshot across Next compilation workers ([2a2d1d6](https://github.com/wojciech94/lunchagregator/commit/2a2d1d62f9a358a7350fa979d4a01e89443cef96))
* **chat:** retain selected absolute dates across midnight ([3c326f8](https://github.com/wojciech94/lunchagregator/commit/3c326f8f8f3462f0af6e387f393080cab18c1cf4))
