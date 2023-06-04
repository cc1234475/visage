# Visage

![](_media/logo.png)

Visage is a userscript to do facial recognition on video's and images in [Stash](https://github.com/stashapp/stash). 

# Stash Userscripts

Installation requires a browser extension such as [Violentmonkey](https://violentmonkey.github.io/) / [Tampermonkey](https://www.tampermonkey.net/) / [Greasemonkey](https://www.greasespot.net/).

**By default the userscripts only work for `http://localhost:9999`**

> If you access Stash from a different address, you will need to modify the userscript when you install it.
>
> Find the line `// @match       http://localhost:9999/*` and replace `http://localhost:9999/*` with your Stash address.

[INSTALL USERSCRIPT](userscript/visage.user.js?raw=1)

Once installed, A new icon will show on a scene's page next to the organized button.

![](_media/face_scan_icon.png)

# How do I use it?

![](_media/example.gif)

# Create your own database.

Please check out https://github.com/cc1234475/visage-ml
