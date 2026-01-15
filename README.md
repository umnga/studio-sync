# Studio Sync

A full-stack audio processing and music tool application with React frontend and Python backend.

## Project Structure

```
studio-sync/
├── frontend/          # React/TypeScript frontend
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── vite.config.ts
│   └── ...other config files
├── backend/           # Python backend scripts
│   ├── scripts/
│   │   ├── buzz_detector.py
│   │   ├── chord_converter.py
│   │   └── tuner.py
│   └── requirements.txt
└── README.md
```

## Getting Started

### Frontend Setup

```bash
cd frontend
npm install  # or bun install
npm run dev
```

The frontend will be available at `http://localhost:5173`

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
```

Then run individual Python scripts as needed for your use case.

## Features

- **Audio Splitter** - Split and process audio files
- **Practice Tools** - Tools for musicians including:
  - Buzz Detector - Detect buzzing in audio
  - Chord Converter - Convert between chord notations
  - Tuner - Detect and tune to precise frequencies
- **Audio Visualization** - Visual waveform display
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
