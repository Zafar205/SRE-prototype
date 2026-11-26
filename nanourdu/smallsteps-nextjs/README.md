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

1. **First consultation.** From Overview, book the first doctor consultation. Choose a date and one of the available times, review the details, and confirm. Open the video room, join and finish the demo call.
2. **Doctor requests tests.** Open **Care team workspace → Doctor review** and send the sample test request. In **Tests & reports**, read the test list and attach the sample result. The upload becomes available only after the doctor sends the request.
3. **Doctor reviews the results.** Return to **Doctor review**, confirm you reviewed the sample results and history, and share a decision. A recommendation unlocks the patient’s **Medication** screen with the sample dose. If GLP-1 is not recommended, the patient sees the decision and can book a visit to ask about other options.
4. **Monthly and optional visits.** Book the required monthly doctor review from **Medication** or **Consultations**. Completing it sets the next review one calendar month later. Rescheduling keeps the existing appointment until a new time is confirmed. Separately, use **Book a visit for questions** to schedule an extra visit. That visit does not replace the monthly review.

The demo advances through example dates as visits are completed. Reset the demo to test the other doctor decision or replay the care journey. Weekly self check-ins and the meal plan remain available from the patient navigation.

The medication screen uses a fixed, fictional Wegovy injection example. Its 0.25 mg once-weekly example for the first four weeks follows the [FDA label, section 2.2](https://www.accessdata.fda.gov/drugsatfda_docs/label/2026/218316s005lbl.pdf). The prototype does not generate individual doses or issue prescriptions. Video, reminders and billing are simulations. Use sample information only.

See [UX handoff](UX-handoff.md) for stories, acceptance criteria and flow details.
