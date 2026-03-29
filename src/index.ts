#!/usr/bin/env node

import { Command } from "commander";
import readline from "node:readline";
import path from "node:path";
import fs from "node:fs";
import { Normandy } from "./orchestrator.js";
import { loadConfig } from "./config/index.js";
import { logger } from "./utils/logger.js";

const program = new Command();

program
  .name("normandy")
  .description(
    "The Normandy -- AI-powered code generation with Commander Shepard and crew",
  )
  .version("1.0.0")
  .argument("[request]", "Optional one-shot mission briefing (omit for interactive CIC)")
  .option(
    "-p, --project <name>",
    "Project name (creates ~/Workspace/<name>)",
  )
  .option(
    "-o, --output <dir>",
    "Output directory (overrides --project)",
  )
  .option(
    "-s, --squad <name>",
    "Deploy a squad member directly (tali, garrus, liara, miranda, mordin)",
  )
  .option("-m, --model <id>", "Override model for all agents")
  .option("-v, --verbose", "Show detailed logging output", false)
  .action(async (request: string | undefined, options) => {
    try {
      const outputDir = resolveOutputDir(options.output, options.project);

      const config = loadConfig({
        outputDir,
        verbose: options.verbose,
        defaultModel: options.model,
      });

      if (options.verbose) {
        logger.level = "debug";
      }

      const normandy = new Normandy(config);

      if (request) {
        await runOneShot(normandy, request, config.outputDir, options.squad);
      } else {
        await runCIC(normandy, config.outputDir);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, "Normandy system failure");
      console.error(`\n  \x1b[31mCritical failure: ${message}\x1b[0m\n`);
      process.exit(1);
    }
  });

program.parse();

function resolveOutputDir(
  outputFlag?: string,
  projectFlag?: string,
): string {
  if (outputFlag) return path.resolve(outputFlag);
  if (projectFlag) {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    return path.join(home, "Workspace", projectFlag);
  }
  return path.resolve("./output");
}

async function runOneShot(
  normandy: Normandy,
  request: string,
  outputDir: string,
  squad?: string,
): Promise<void> {
  console.log("\n  SSV Normandy -- Mission Briefing\n");
  console.log(`  Objective: ${request}`);
  console.log(`  Output:    ${outputDir}`);
  if (squad) {
    console.log(`  Deployed:  ${squad} (direct assignment)`);
  } else {
    console.log("  Commander: Shepard (full squad available)");
  }
  console.log("");

  const result = await normandy.execute(request, { specialist: squad });

  console.log("\n" + "=".repeat(60));
  console.log("  MISSION REPORT");
  console.log("=".repeat(60) + "\n");
  console.log(result.output);

  if (result.files.length > 0) {
    console.log("\n  Generated Files:");
    for (const file of result.files) {
      console.log(`    - ${file.path} (${file.language})`);
    }
  }

  console.log(`\n  ${result.taskSummary}\n`);
}

async function runCIC(
  normandy: Normandy,
  outputDir: string,
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const projDisplay = outputDir.length > 26
    ? "..." + outputDir.slice(-23)
    : outputDir.padEnd(26);

  console.log("");
  console.log("  \x1b[36m╔══════════════════════════════════════════╗\x1b[0m");
  console.log("  \x1b[36m║\x1b[0m   \x1b[1m\x1b[37mSSV NORMANDY -- Combat Information Center\x1b[0m \x1b[36m║\x1b[0m");
  console.log("  \x1b[36m╠══════════════════════════════════════════╣\x1b[0m");
  console.log(`  \x1b[36m║\x1b[0m  Project: ${projDisplay}     \x1b[36m║\x1b[0m`);
  console.log("  \x1b[36m╠══════════════════════════════════════════╣\x1b[0m");
  console.log("  \x1b[36m║\x1b[0m  \x1b[33mSquad:\x1b[0m  /squad for full roster            \x1b[36m║\x1b[0m");
  console.log("  \x1b[36m║\x1b[0m    11 specialists standing by              \x1b[36m║\x1b[0m");
  console.log("  \x1b[36m╠══════════════════════════════════════════╣\x1b[0m");
  console.log("  \x1b[36m║\x1b[0m  \x1b[33mCommands:\x1b[0m                                \x1b[36m║\x1b[0m");
  console.log("  \x1b[36m║\x1b[0m    /files  - list generated files         \x1b[36m║\x1b[0m");
  console.log("  \x1b[36m║\x1b[0m    /squad  - show squad roster            \x1b[36m║\x1b[0m");
  console.log("  \x1b[36m║\x1b[0m    /clear  - reset comms                  \x1b[36m║\x1b[0m");
  console.log("  \x1b[36m║\x1b[0m    /help   - show this help               \x1b[36m║\x1b[0m");
  console.log("  \x1b[36m║\x1b[0m    exit    - disengage                    \x1b[36m║\x1b[0m");
  console.log("  \x1b[36m╚══════════════════════════════════════════╝\x1b[0m");
  console.log("");
  console.log("  \x1b[2mSpeak to Commander Shepard. The squad is standing by.\x1b[0m");
  console.log("");

  // Ensure output directory exists
  await fs.promises.mkdir(outputDir, { recursive: true });

  const allFiles = new Map<string, string>();

  const prompt = () => {
    rl.question("  \x1b[36mShepard>\x1b[0m ", async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      if (trimmed.toLowerCase() === "exit" || trimmed.toLowerCase() === "/quit") {
        console.log("\n  \x1b[2mI should go.\x1b[0m\n");
        rl.close();
        process.exit(0);
      }

      if (trimmed === "/help") {
        console.log("");
        console.log("  Brief Commander Shepard on what you need built.");
        console.log("  Shepard will assign squad members to handle the mission.");
        console.log("");
        console.log("  Type /squad for full roster, or just describe what you need.");
        console.log("");
        console.log("  \x1b[33mCommands:\x1b[0m");
        console.log("    /files  - list all generated files");
        console.log("    /squad  - show squad roster & capabilities");
        console.log("    /clear  - reset conversation (keeps files)");
        console.log("    /help   - show this help");
        console.log("    exit    - disengage");
        console.log("");
        prompt();
        return;
      }

      if (trimmed === "/squad") {
        console.log("");
        console.log("  \x1b[1m\x1b[33mNormandy Squad Roster\x1b[0m");
        console.log("");
        console.log("  \x1b[33mBuilders:\x1b[0m");
        console.log("  \x1b[36mTali'Zorah\x1b[0m     -- Chief Engineer");
        console.log("    Web apps: React, Next.js, Vue, Angular, Tailwind");
        console.log("  \x1b[36mGarrus\x1b[0m         -- Calibration Expert");
        console.log("    Games: Phaser, Three.js, Unity C#, Godot");
        console.log("  \x1b[36mLiara\x1b[0m          -- Information Specialist");
        console.log("    Mobile: React Native, Flutter, Swift, Kotlin");
        console.log("  \x1b[36mLegion\x1b[0m         -- Data Specialist");
        console.log("    Backend: databases, APIs, schemas, services");
        console.log("");
        console.log("  \x1b[33mDesigners:\x1b[0m");
        console.log("  \x1b[36mKasumi\x1b[0m         -- UX/Product Designer");
        console.log("    User flows, wireframes, design systems");
        console.log("  \x1b[36mSamara\x1b[0m         -- Game Designer");
        console.log("    Mechanics, balancing, progression, game feel");
        console.log("");
        console.log("  \x1b[33mQuality & Architecture:\x1b[0m");
        console.log("  \x1b[36mMordin\x1b[0m         -- Scientist/Architect");
        console.log("    System architecture, technical specs");
        console.log("  \x1b[36mMiranda\x1b[0m        -- Perfectionist Operative");
        console.log("    Code review, security audit, QA");
        console.log("  \x1b[36mThane\x1b[0m          -- Testing Specialist");
        console.log("    Unit, integration, and e2e tests");
        console.log("");
        console.log("  \x1b[33mOperations:\x1b[0m");
        console.log("  \x1b[36mEDI\x1b[0m            -- DevOps/Infrastructure");
        console.log("    CI/CD, Docker, deployment, GitHub Actions");
        console.log("  \x1b[36mJavik\x1b[0m          -- Documentation");
        console.log("    READMEs, API docs, guides, changelogs");
        console.log("");
        prompt();
        return;
      }

      if (trimmed === "/files") {
        if (allFiles.size === 0) {
          console.log("\n  No files generated yet. The squad is standing by.\n");
        } else {
          console.log("\n  \x1b[33mMission Files:\x1b[0m");
          for (const [filePath, lang] of allFiles) {
            console.log(`    - ${filePath} (${lang})`);
          }
          console.log("");
        }
        prompt();
        return;
      }

      if (trimmed === "/clear") {
        console.log("\n  \x1b[2mComms reset. Squad still on standby.\x1b[0m\n");
        prompt();
        return;
      }

      // Send message to Shepard
      console.log("");

      try {
        const result = await normandy.chat(trimmed);

        // Track files
        for (const file of result.files) {
          allFiles.set(file.path, file.language);
        }

        // Display response
        console.log(`\n  \x1b[33mShepard>\x1b[0m`);
        console.log("");

        const lines = result.output.split("\n");
        for (const line of lines) {
          console.log(`  ${line}`);
        }

        if (result.files.length > 0) {
          console.log("");
          console.log("  \x1b[32mMission files generated:\x1b[0m");
          for (const file of result.files) {
            console.log(`    - ${file.path} (${file.language})`);
          }
        }

        console.log("");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`\n  \x1b[31mWe've had a critical mission failure: ${message}\x1b[0m\n`);
      }

      prompt();
    });
  };

  prompt();

  rl.on("close", () => {
    console.log("\n  \x1b[2mI should go.\x1b[0m\n");
    process.exit(0);
  });
}
