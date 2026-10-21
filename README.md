# Fivebar Linkage Studio

I started building a chess robot using a five-bar linkage and wanted a way to experiment with the geometry before printing everything. This simulator lets me explore reachability, motor placement, link lengths, and movement around a chessboard.

**[Try the simulator](https://tricko3d.github.io/fivebar-linkage-studio/)**

![Fivebar Linkage Studio](screenshots/dashboard.png)

## Features

- Adjustable chessboard dimensions and motor mounting positions.
- Independent linkage lengths, assembly branches, and gripper attachments.
- Reachability visualization and servo travel estimates.
- Custom manufacturing/material overlay with FDM, SLS, SLA/DLP, MJF, CNC machining, sheet cutting, and metal LPBF process filters.
- 52 material presets spanning engineering filaments, powder-bed nylons, photopolymer resins, metals, and sheet materials.
- Automatic modulus, density, effective stiffness and bending-threshold inputs; manual editing switches to Custom.
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

### Manufacturing/material picker

Open **Mechanics & Loads → Material & bending limits**, then click the manufacturing/material selector. Choose a process (FDM/FFF, SLS, SLA/DLP, MJF, CNC machining, sheet cutting, or metal LPBF/SLM), search for a material and select it. The picker overlays the simulator, so the narrow settings panel does not clip the catalog. Escape or clicking outside closes it without changes.

Manufacturing process and material are both saved in the JSON configuration. The selected process is also included in the calculation report and SolidWorks TXT export. Existing PLA/PETG material IDs are preserved. **Custom values** keeps the current modulus, density, stiffness factor and bending limit while assigning a manufacturing process.

Material properties depend on manufacturing route; PA12 for FDM, SLS and MJF is represented by separate presets. Material-based calculations are still simplified screening estimates. The dialog's process choices do not verify printer, cutter, or CNC compatibility.

### Material preset limitations

The material dropdown contains **indicative, room-temperature screening values** for simplified beam calculations. The elastic/bending modulus is a nominal representative value, while *effective stiffness factor* discounts it (especially for printed links). *Allowable bending* is a conservative adjustable screening threshold; **it is not a guaranteed failure stress or design allowable**. Choosing metal assumes a homogeneous solid material; G10/FR-4 and carbon-filled polymers are direction-dependent. Real part strength depends on orientation, annealing, layer adhesion, moisture, temperature, density of infill, and many other variables. TPU in particular is not well modeled by a linear small-deflection beam approximation.

These presets are **not printer compatibility profiles**. High-temperature grades such as PEEK, PEI and PPS-CF may require industrial hardware. Confirm nozzle/chamber requirements against your printer and filament datasheets.

Useful material data and context:

- [Bambu Lab filament guide](https://cdn1.bambulab.com/filament/filament-guide/250123/filament-guide-en.pdf) and individual filament property tables
- [Bambu Lab PLA-CF](https://us.store.bambulab.com/products/pla-cf?id=41158283591816), [PA6-CF](https://eu.store.bambulab.com/nl-nl/products/pa6-cf), [PET-CF](https://us.store.bambulab.com/en/products/pet-cf), [PPS-CF](https://us.store.bambulab.com/collections/bambu-lab-3d-printer-filament/products/pps-cf)
- [Prusa advanced filament guide](https://blog.prusa3d.com/advanced-filament-guide_39718/) and [engineering alloy properties](https://manufacturingprocesses.org/charts/material-properties)

**This was built using ChatGPT (GPT-6, OpenAI) and is not in any way an accurate model.**

Inspired by [unswei/fivebar](https://github.com/unswei/fivebar) by Oliver Obst.

## License

MIT. See [LICENSE](LICENSE).
