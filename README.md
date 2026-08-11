# Parallax Image Gallery

A smooth parallax drag-scroll image track built with the native **Web Animations API** and mouse tracking — no libraries.

## Features
- Fluid drag-scroll with momentum and easing
- Parallax depth on individual images based on scroll percentage
- Cinema view: click an image and it unfolds from its spot in the track into a
  full-bleed shot with letterbox bars, a slow Ken Burns zoom/pan, film grain,
  vignette and title cards. Arrow keys / swipe cut between shots, Esc folds it back.
- Captions come from `data-location` on each `<img>`
- Scramble-text animation on the hero heading
- Custom cursor blob that follows mouse position
- Bug fix: click-without-drag no longer freezes the track (missing `data-percentage` attribute)

## Tech
- Vanilla JavaScript (ES6+)
- CSS custom properties + transitions
- Web Animations API (`Element.animate()`)

## Run locally
Just open `index.html` in a browser — no build step.

## Live
Deployed on [nilshogberg.vercel.app](https://nilshogberg.vercel.app) as a portfolio sub-project.
