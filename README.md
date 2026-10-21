<p align="center">
  <img src="screenshots/fivebar-header.svg" alt="Fivebar Linkage Studio — project logo and title" width="800">
</p>

I'm building a chess robot using a five-bar linkage. I made this interactive simulator to experiment with motor placement, link lengths and the reachable workspace before making physical prototypes.

**[Try Fivebar Studio](https://tricko3d.github.io/fivebar-linkage-studio/)**

<p align="center">
  <img src="screenshots/dashboard.png" alt="Fivebar Linkage Studio simulator" width="900">
</p>

<p align="center">
  <img src="screenshots/coverage-stats.svg" alt="Example workspace coverage: 64 of 64 chess squares reachable, 100% of board area sampled, farthest square 381 mm" width="900">
</p>

## What it does

- Visualize a five-bar linkage over a chessboard, including reachability, joint stops and motor travel.
- Experiment with dimensions, materials, loads and motion, with torque and stiffness estimates.
- Export dimensioned CAD drawings, SolidWorks variables, and a calculation report.
- Share complete configurations and reports through deterministic URLs.

Built with vanilla HTML, CSS and JavaScript. You can [browse the source code](https://github.com/tricko3D/fivebar-linkage-studio) or run it locally with `python3 -m http.server 8000`.

**Note:** Mechanical calculations are simplified estimates for design exploration, not validated engineering or safety ratings.

Made with assistance from ChatGPT (GPT-6, OpenAI). Inspired by [unswei/fivebar](https://github.com/unswei/fivebar) by Oliver Obst.

**[MIT License](LICENSE)**
