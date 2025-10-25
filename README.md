h5pal
=====

# Introduction

《仙剑奇侠传》[(百度百科)](http://baike.baidu.com/view/2188.htm#sub5215543)的HTML5 移植，基于[SDLPAL](http://sdlpal.codeplex.com)。

&lt;The Legend of Sword and Fairy> I.E. PAL [(wikipedia)](http://en.wikipedia.org/wiki/The_Legend_of_Sword_and_Fairy) porting to HTML5. Based on [SDLPAL](http://sdlpal.codeplex.com).

[English version of this README](#ENG)

## 最近更新

- 支持触控手势：点击屏幕中部确认，划动控制主角移动，移动端直接可玩。
- 新增 `PAL_CONFIG` 配置，默认从 `pal-assets/` 读取资源，可按需重定向或开启背景音乐。
- 音乐可选：默认关闭 MP3 播放，若准备好原版 MP3 资源，将 `PAL_CONFIG.enableAudio` 设为 `true` 并提供 `audioBaseUrl`。
- 系统菜单的存档/读档使用浏览器 localStorage，可选择 1~5 号槽位。
- 构建产物可直接复制到 `xianjian.github.com/ultimate/`，包含运行所需资源。

# 如何搞起

## 环境

* [Node.js](http://nodejs.org/)
* [gulp](http://gulpjs.com/)
* [bower](http://bower.io/)

## 构建

* `bower install`
* `npm install`
* `gulp`
* 若需要替换资源，可准备仙剑95版（存档180~185KB版本）的所有文件放入`pal-assets/`目录（仓库已预置示例）。

## 运行

* `gulp serve`
* 在`chrome://flags`里打开_“启用实验性JavaScript”_
* 打开[http://localhost:8005/h5pal.html](http://localhost:8005/h5pal.html) 
* 或直接打开 `dist/h5pal.html`（构建完成后），可整包部署至 `xianjian.github.com/ultimate/`
* Enjoy

# 其他

## 一句话，我TM就想知道能玩吗？

能走，能对话，能开宝箱，能用道具，能打架（没完全实现）……能做很多事情，排除BUG造成剧情无法进行下去以外，只靠走地图可以体验很多很多剧情……了。

因为战斗系统有很多没实现以及很多BUG，当出错的时候会直接判定为赢。建议到`common.js`里打开`INVINCIBLE`开启无敌降低游戏难度。

## 没图你说个JB

[Screenshots](http://liuji-jim.github.io/h5pal/screenshots.html)

## 完成度

| 模块 | 进度 |
| --- | ---:|
| 资源 | 90% |
| 读档 | 99% |
| 存档 | 40% |
| Surface | 90% |
| 位图 | 99% |
| Sprite | 99% |
| 地图 | 90% |
| 场景 | 90% |
| 调色盘 | 90% |
| 文本 | 99% |
| 脚本（天坑） | 70% |
| 平常UI | 90% |
| 战斗UI | 90% |
| 战斗（天坑） | 70% |
| 播片 | 90% |
| 结局 | 95% |
| 音乐 | 0% |
| 音效 | 0% |

~~以上数值除了为0的外都是盲目乐观的~~

## 已知问题

[Issues](https://github.com/LiuJi-Jim/h5pal/issues)太多了，懒得列，慢慢补。

## 开发者须知

* ES6 and [babel](http://babeljs.io/)
* ES6 [generator/yield](http://jimliu.net/2014/11/28/a-brief-look-at-es6-generator-function/) and [co](https://github.com/tj/co)

## License

GPL v3

## Inspired by [SDLPAL](http://sdlpal.codeplex.com)

## 结语

仙剑20岁生日快乐

----

# <a name="ENG"></a>How to play

## Environment

* [Node.js](http://nodejs.org/)
* [gulp](http://gulpjs.com/)
* [bower](http://bower.io/)

## Build

* `bower install`
* `npm install`
* `gulp`
* Optionally replace the bundled assets by copying pal95 (180~185KB save) files into `pal-assets/` (a sample set is already included).

## Run

* `gulp serve`
* Turn on _"Enable experimental JavaScript"_ in `chrome://flags`
* Open [http://localhost:8005/h5pal.html](http://localhost:8005/h5pal.html) 
* Enjoy

# Etc.

## I'm just wondering whether I can play it or not.

You can walk, talk, open chests, use items, fight ... a lot of thing in this game. Without some bugs crashing the game, you can experience the story well.

Due to the completeness and bugs of battle module, you will be judged as win when exception happens. I strongly advise you to turn on `INVINCIBLE` in `common.js` to make the game easier.

## STFU without pictures

[Screenshots](http://liuji-jim.github.io/h5pal/screenshots.html)

## Progress

| Module | Progress |
| --- | ---:|
| Resource | 90% |
| Loading | 99% |
| Saving | 40% |
| Surface | 90% |
| Bitmap | 99% |
| Sprite | 99% |
| Map | 90% |
| Scene | 90% |
| Palette | 90% |
| Text | 99% |
| Script (OMG) | 70% |
| Game UI | 90% |
| Battle UI | 90% |
| Battle (OMG) | 70% |
| Movie | 90% |
| Ending | 95% |
| Music | 0% |
| Sound | 0% |

~~Numbers above are all given at will except zeros.~~

## Known Issues

[Issues](https://github.com/LiuJi-Jim/h5pal/issues) - tooooo many. Will fill this later.

## Developers should know first

* ES6 and [babel](http://babeljs.io/)
* ES6 [generator/yield](http://jimliu.net/2014/11/28/a-brief-look-at-es6-generator-function/) and [co](https://github.com/tj/co)

## License

GPL v3

## Inspired by [SDLPAL](http://sdlpal.codeplex.com)

## Ending

Happy 20th birthday to pal.
