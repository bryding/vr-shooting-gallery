# 🌴 VR Beach Shooting Gallery

A little **VR game for the Meta Quest browser**, made with web code (A-Frame).
You stand in a beach cabana while birds fly past carrying targets — grab your
gun and shoot them!

## How to play (in the Quest 3S)

1. Open the public link in the **Quest Browser**.
2. Tap the **goggles button** (bottom-right) to enter VR.
3. **Squeeze the GRIP** on your right controller to grab the gun.
4. **Pull the TRIGGER** to shoot the targets the birds carry.
5. Out of bullets? **Pull the joystick BACK** to reload.

## Try it on the computer first (no headset)

From this folder run a tiny web server, then open the link it gives you:

```
python3 -m http.server 8000
```

Now open **http://localhost:8000** in a browser. You can **click** the targets
with the mouse to test them. (Full VR mode needs the public web link.)

## The files

- `index.html` — the VR world: the cabana, ocean, palm trees, gun stand, player.
- `js/game.js` — the game brain: sounds, the gun, the birds, the targets, score.
  The fun numbers to tweak live in the **CONFIG** box at the top.

## Built with

[A-Frame](https://aframe.io) — a free toolkit for making VR worlds with HTML-like
tags. It handles the 3D and the Quest controllers for us.
