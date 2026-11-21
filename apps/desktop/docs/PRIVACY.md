# Meshdiff Desktop: what stays on your computer and what doesn't

This describes exactly what the app does with your data. It matches the code in this
repository (`apps/desktop`), and the checks in `tests/` verify the key claims.

## By default: nothing leaves your computer

- Your projects, model files, analysis results and comments are stored in a folder on your
  computer (Settings → *Your library* shows where, and can open it). Plain JSON and plain
  files: you can inspect, copy or delete them yourself.
- You don't need an account. The app works fully offline.
- The app's window can't make network requests at all (enforced by its content security
  policy and by the app itself). Only the app's background process can, and only for the
  two things below.

## Network access the app does make

1. **Update checks.** It asks GitHub (the public Meshdiff releases page) whether a newer
   version exists and downloads it. No personal data is sent beyond what any web request
   includes (your IP address, the app version).
2. **Team sync, only if you choose it.** If you sign in and connect a project to a team,
   that project talks to Meshdiff's cloud. Nothing is sent for projects you don't connect.

## What Team sync sends

For a connected project, to Meshdiff's servers (and so to your team):

- each version's **file name, size and SHA-256 fingerprint** (a fixed-length code derived
  from the file; it can confirm a file is the same one but cannot be turned back into it);
- the **analysis results** for each version: volume and size changes, wall thickness,
  overhangs, hole counts, printability warnings and the change summary;
- your **comments** (text, where on the model they point, replies, status, who wrote them).

**Your model files are never uploaded.** A teammate who wants to see the 3D model chooses
their own copy of the file on their own computer; the app accepts it only if its fingerprint
matches, and it stays on their computer.

Your email and a session token are used to sign you in. The token is stored on your computer,
encrypted with your operating system's key store (Windows DPAPI). Your password is sent once to
sign in and is never stored.

## Removing things

- **Disconnect** a project (project page) to stop syncing it. Everything stays on your computer
  and in your team's cloud project.
- Deleting a synced version or project on your computer does **not** delete it from the cloud;
  your team keeps its copy. Use the website to remove things from the cloud.
- **Sign out** (Settings) removes the stored session. Your projects and files are untouched.
- Uninstalling the app leaves your library folder in place; delete the folder to remove it.

## Questions

Contact: [add a real support address before publishing]
