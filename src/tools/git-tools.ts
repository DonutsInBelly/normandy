import { ToolHandler } from "./types.js";
import { spawn } from "node:child_process";

function exec(
  command: string,
  cwd: string,
  timeout = 30000,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn("sh", ["-c", command], { cwd, timeout });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on("close", (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code: code ?? 1 });
    });
    proc.on("error", (err) => {
      resolve({ stdout: "", stderr: err.message, code: 1 });
    });
  });
}

export function createGitTools(workingDir: string): ToolHandler[] {
  const gitInit: ToolHandler = {
    definition: {
      name: "git_init",
      description:
        "Initialize a new git repository in the project directory and create an initial commit with all files.",
      input_schema: {
        type: "object" as const,
        properties: {
          message: {
            type: "string",
            description:
              'Commit message for the initial commit (default: "Initial commit")',
          },
        },
        required: [],
      },
    },
    async execute(input) {
      const message = (input.message as string) || "Initial commit";

      // Check if already a git repo
      const check = await exec("git rev-parse --is-inside-work-tree", workingDir);
      if (check.code === 0) {
        return "Already a git repository.";
      }

      const init = await exec("git init && git branch -m main", workingDir);
      if (init.code !== 0) {
        return `Error initializing repo: ${init.stderr}`;
      }

      const add = await exec("git add -A", workingDir);
      if (add.code !== 0) {
        return `Error staging files: ${add.stderr}`;
      }

      const escapedMessage = message.replace(/'/g, "'\\''");
      const commit = await exec(
        `git commit -m '${escapedMessage}'`,
        workingDir,
      );
      if (commit.code !== 0) {
        return `Error committing: ${commit.stderr}`;
      }

      return `Git repository initialized on branch 'main' with commit: ${message}`;
    },
  };

  const gitCommit: ToolHandler = {
    definition: {
      name: "git_commit",
      description:
        "Stage and commit changes to the git repository. Stages all modified and new files, then commits with the given message.",
      input_schema: {
        type: "object" as const,
        properties: {
          message: {
            type: "string",
            description: "Commit message describing the changes",
          },
          files: {
            type: "array",
            items: { type: "string" },
            description:
              "Specific files to stage (default: all changed files). Use this to commit specific files instead of everything.",
          },
        },
        required: ["message"],
      },
    },
    async execute(input) {
      const message = input.message as string;
      const files = input.files as string[] | undefined;

      // Check if this is a git repo
      const check = await exec("git rev-parse --is-inside-work-tree", workingDir);
      if (check.code !== 0) {
        return "Error: Not a git repository. Use git_init first.";
      }

      // Stage files
      const addCmd = files && files.length > 0
        ? `git add ${files.map((f) => `'${f.replace(/'/g, "'\\''")}'`).join(" ")}`
        : "git add -A";

      const add = await exec(addCmd, workingDir);
      if (add.code !== 0) {
        return `Error staging files: ${add.stderr}`;
      }

      // Check if there's anything to commit
      const status = await exec("git diff --cached --name-only", workingDir);
      if (!status.stdout) {
        return "Nothing to commit -- working tree is clean.";
      }

      const escapedMessage = message.replace(/'/g, "'\\''");
      const commit = await exec(
        `git commit -m '${escapedMessage}'`,
        workingDir,
      );
      if (commit.code !== 0) {
        return `Error committing: ${commit.stderr}`;
      }

      const filesCommitted = status.stdout.split("\n").length;
      return `Committed ${filesCommitted} file(s): ${message}\n\nFiles:\n${status.stdout}`;
    },
  };

  const createGithubRepo: ToolHandler = {
    definition: {
      name: "create_github_repo",
      description:
        "Create a new GitHub repository and push the local git repo to it. The repo must already be initialized with git_init.",
      input_schema: {
        type: "object" as const,
        properties: {
          name: {
            type: "string",
            description: "Repository name on GitHub",
          },
          description: {
            type: "string",
            description: "Short description of the repository",
          },
          private: {
            type: "boolean",
            description: "Whether the repo should be private (default: false)",
          },
        },
        required: ["name"],
      },
    },
    async execute(input) {
      const name = input.name as string;
      const description = (input.description as string) || "";
      const isPrivate = (input.private as boolean) || false;

      // Check if git repo exists
      const check = await exec("git rev-parse --is-inside-work-tree", workingDir);
      if (check.code !== 0) {
        return "Error: Not a git repository. Use git_init first.";
      }

      // Check if remote already exists
      const remoteCheck = await exec("git remote get-url origin", workingDir);
      if (remoteCheck.code === 0) {
        return `Remote 'origin' already exists: ${remoteCheck.stdout}. Use git_commit and the repo will be pushed on next commit.`;
      }

      const visibility = isPrivate ? "--private" : "--public";
      const descFlag = description
        ? `--description '${description.replace(/'/g, "'\\''")}'`
        : "";

      const create = await exec(
        `gh repo create '${name}' ${visibility} ${descFlag} --source=. --remote=origin --push`,
        workingDir,
        60000,
      );

      if (create.code !== 0) {
        return `Error creating GitHub repo: ${create.stderr}`;
      }

      return `GitHub repository created and pushed: ${create.stdout}`;
    },
  };

  const createPullRequest: ToolHandler = {
    definition: {
      name: "create_pull_request",
      description:
        "Create a new branch, commit changes, push, and open a pull request on GitHub.",
      input_schema: {
        type: "object" as const,
        properties: {
          branch: {
            type: "string",
            description: "Branch name for the PR (e.g., 'feature/add-auth')",
          },
          title: {
            type: "string",
            description: "Pull request title",
          },
          body: {
            type: "string",
            description: "Pull request description (supports markdown)",
          },
          base: {
            type: "string",
            description: "Base branch to merge into (default: 'main')",
          },
        },
        required: ["branch", "title"],
      },
    },
    async execute(input) {
      const branch = input.branch as string;
      const title = input.title as string;
      const body = (input.body as string) || "";
      const base = (input.base as string) || "main";

      // Create and switch to branch
      const branchCreate = await exec(
        `git checkout -b '${branch.replace(/'/g, "'\\''")}'`,
        workingDir,
      );
      if (branchCreate.code !== 0) {
        return `Error creating branch: ${branchCreate.stderr}`;
      }

      // Stage and commit any uncommitted changes
      const status = await exec("git status --porcelain", workingDir);
      if (status.stdout) {
        const add = await exec("git add -A", workingDir);
        if (add.code !== 0) {
          return `Error staging files: ${add.stderr}`;
        }
        const escapedTitle = title.replace(/'/g, "'\\''");
        const commit = await exec(
          `git commit -m '${escapedTitle}'`,
          workingDir,
        );
        if (commit.code !== 0) {
          return `Error committing: ${commit.stderr}`;
        }
      }

      // Push branch
      const push = await exec(
        `git push -u origin '${branch.replace(/'/g, "'\\''")}'`,
        workingDir,
        60000,
      );
      if (push.code !== 0) {
        return `Error pushing branch: ${push.stderr}`;
      }

      // Create PR
      const escapedTitle = title.replace(/'/g, "'\\''");
      const escapedBody = body.replace(/'/g, "'\\''");
      const pr = await exec(
        `gh pr create --title '${escapedTitle}' --body '${escapedBody}' --base '${base}'`,
        workingDir,
        30000,
      );
      if (pr.code !== 0) {
        return `Error creating PR: ${pr.stderr}`;
      }

      // Switch back to base branch
      await exec(`git checkout '${base}'`, workingDir);

      return `Pull request created: ${pr.stdout}`;
    },
  };

  const createIssue: ToolHandler = {
    definition: {
      name: "create_issue",
      description:
        "Create a GitHub issue on the repository. Use this to report bugs, suggest improvements, or track work items found during code review.",
      input_schema: {
        type: "object" as const,
        properties: {
          title: {
            type: "string",
            description: "Issue title",
          },
          body: {
            type: "string",
            description: "Issue description with details (supports markdown)",
          },
          labels: {
            type: "array",
            items: { type: "string" },
            description:
              'Labels to apply (e.g., ["bug", "security", "enhancement"])',
          },
        },
        required: ["title"],
      },
    },
    async execute(input) {
      const title = input.title as string;
      const body = (input.body as string) || "";
      const labels = input.labels as string[] | undefined;

      const escapedTitle = title.replace(/'/g, "'\\''");
      const escapedBody = body.replace(/'/g, "'\\''");
      const labelFlag =
        labels && labels.length > 0 ? `--label '${labels.join(",")}'` : "";

      const result = await exec(
        `gh issue create --title '${escapedTitle}' --body '${escapedBody}' ${labelFlag}`,
        workingDir,
        30000,
      );

      if (result.code !== 0) {
        return `Error creating issue: ${result.stderr}`;
      }

      return `Issue created: ${result.stdout}`;
    },
  };

  const listIssues: ToolHandler = {
    definition: {
      name: "list_issues",
      description:
        "List open issues on the GitHub repository. Useful for checking what work needs to be done.",
      input_schema: {
        type: "object" as const,
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of issues to list (default: 10)",
          },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "Filter by labels",
          },
        },
        required: [],
      },
    },
    async execute(input) {
      const limit = (input.limit as number) || 10;
      const labels = input.labels as string[] | undefined;

      const labelFlag =
        labels && labels.length > 0 ? `--label '${labels.join(",")}'` : "";

      const result = await exec(
        `gh issue list --limit ${limit} ${labelFlag}`,
        workingDir,
        15000,
      );

      if (result.code !== 0) {
        return `Error listing issues: ${result.stderr}`;
      }

      if (!result.stdout) {
        return "No open issues found.";
      }

      return result.stdout;
    },
  };

  return [gitInit, gitCommit, createGithubRepo, createPullRequest, createIssue, listIssues];
}
