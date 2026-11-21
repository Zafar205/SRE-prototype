# Smallsteps · GLP-1 telemedicine

An interactive Next.js App Router prototype with fictional patient and doctor profiles. Booking, check-ins and plan changes stay in the current browser.

## Run locally

Use Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Run `npm run build` for the production build.

## Deploy on Vercel

Push this folder to a Git repository and import it into Vercel. Use the **Next.js** preset. If this folder is inside a larger repository, set **Root Directory** to `smallsteps-nextjs`. Use Node.js 24.x and the default build command. The demo requires no environment variables.

## Walkthrough

- **Booking**. Start intake and attach the sample lab report. Choose the initial screening on Monday, Nov 23. The 10:00 AM slot always fails the availability check. Use the suggested 12:30 PM slot or choose another time. The booking reference appears after confirmation. Reset the demo to replay the first availability check.
- **Doctor recommendation**. Open **Medication** in the patient navigation or choose **View medication** from the visit summary. To simulate sharing the recommendation, switch to **Care team workspace**, open **Doctor review**, complete the checklist and select **Share sample recommendation**. The patient screen then shows **Shared in demo**.
- **Follow-up**. Finish the simulated video visit, view the meal plan and add a weight and symptom check-in. The dietitian can publish edits from the care team workspace.

The medication screen uses a fixed, fictional Wegovy injection example. Its 0.25 mg once-weekly example for the first four weeks follows the [FDA label, section 2.2](https://www.accessdata.fda.gov/drugsatfda_docs/label/2026/218316s005lbl.pdf). The prototype does not generate individual doses or issue prescriptions. Video, reminders and billing are simulations. Use sample information only.

See [UX handoff](UX-handoff.md) for stories, acceptance criteria and flow details.
