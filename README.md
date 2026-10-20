# Fivebar Linkage Studio

I started building a chess robot using a five-bar linkage and wanted a way to experiment with the geometry before printing everything. This simulator lets me explore reachability, motor placement, link lengths, and movement around a chessboard.

**[Try the simulator](https://tricko3d.github.io/fivebar-linkage-studio/)**

![Fivebar Linkage Studio](screenshots/dashboard.png)

## Features

- Adjustable chessboard dimensions and motor mounting positions.
- Independent linkage lengths, assembly branches, and gripper attachments.
- Reachability visualization and servo travel estimates.
- Link materials, cross-sections, loads, motor and transmission settings.
- Motion Study with playback, torque/RPM bars, and selectable graphs.
- Import/export configuration and generate reports or SolidWorks variables.

## Running locally

Plain HTML, CSS, and JavaScript. Use the **Live Server** extension in VS Code, or run:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## About the model

The geometry calculations are useful for comparing different layouts, but a reachable position doesn't automatically mean the mechanism will work well there.

I added the detailed Markdown report so I can check the intermediate numbers and eventually compare them with actual measurements from printed prototypes.

**This was built using ChatGPT (GPT-6, OpenAI) and is not in any way an accurate model.**

Inspired by [unswei/fivebar](https://github.com/unswei/fivebar) by Oliver Obst.

## License

MIT. See [LICENSE](LICENSE).
