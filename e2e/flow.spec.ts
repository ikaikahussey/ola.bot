import { expect, test, type Page } from "@playwright/test";

async function passSafetyChecks(page: Page) {
  await page.getByRole("link", { name: "Start assessment" }).click();
  for (let i = 0; i < 8; i++) {
    await expect(page.getByText(`Safety check ${i + 1} of 8`)).toBeVisible();
    await page.getByRole("button", { name: "No", exact: true }).click();
  }
}

async function answer(page: Page, label: string) {
  await page.getByRole("radio", { name: label, exact: true }).check();
  await page.getByRole("button", { name: /Next|Review answers/ }).click();
}

const providerFixture = {
  source: { name: "CMS NPPES NPI Registry", url: "https://npiregistry.cms.hhs.gov/" },
  queried_at: "2026-09-27T00:00:00Z",
  center: { zip: "96813", city: "Honolulu", state: "HI" },
  radius_miles: 25,
  specialty: "urgent_care",
  results: [
    {
      npi: "1234567893",
      name: "Example Urgent Care LLC",
      kind: "organization",
      specialty: "Clinic/Center, Urgent Care",
      address: "1000 Example Ave",
      city: "Honolulu",
      state: "HI",
      zip: "96816",
      phone: "(808) 555-0100",
      distance_miles: 2.4,
      registry_url: "https://npiregistry.cms.hhs.gov/provider-view/1234567893",
    },
  ],
  notices: ["Distances are straight-line from ZIP code centers, not driving distance."],
  unavailable_fields: ["ratings", "hours", "insurance networks", "wait times", "appointment availability"],
};

test("sore throat: full flow to an auditable result, finder, and PDF", async ({ page }) => {
  await page.route("**/api/providers?*", (route) => route.fulfill({ json: providerFixture }));
  await page.goto("/");
  await passSafetyChecks(page);

  await page.getByLabel("Main symptom").fill("I have a sore throat");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: /Mapping to: sore throat assessment \(McIsaac score\)/ })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "No", exact: true }).click(); // warning signs

  await expect(page.getByText("We'll ask 5 questions based on the McIsaac score (validated 1998).")).toBeVisible();
  await expect(page.getByText("Question 1 of 5")).toBeVisible();
  await answer(page, "15 to 44 years");
  await answer(page, "Yes"); // fever
  await answer(page, "Yes"); // no cough
  await answer(page, "Yes"); // nodes
  await answer(page, "No"); // exudate

  await expect(page.getByRole("heading", { name: "Review your answers" })).toBeVisible();
  await page.getByRole("button", { name: "See my result" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Moderate likelihood of strep" })).toBeVisible();
  await expect(page.getByText("Care level: URGENT CARE")).toBeVisible();
  const trace = page.locator("table.trace-table").first();
  await expect(trace).toContainText("Fever ≥38°C (100.4°F)");
  await expect(trace).toContainText("+1");
  await expect(trace.locator("tfoot")).toContainText("3");
  await expect(page.getByRole("link", { name: "PubMed 9475915" })).toHaveAttribute("href", "https://pubmed.ncbi.nlm.nih.gov/9475915/");
  await expect(page.locator("p", { hasText: /^Session ID:/ })).toBeVisible();

  // Physician finder defaults to Urgent Care and updates live.
  await expect(page.getByLabel("Specialty")).toHaveValue("urgent_care");
  await page.getByLabel("Near ZIP code").fill("96813");
  await expect(page.getByRole("heading", { name: /Example Urgent Care LLC/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:8085550100");

  // Opt-in share adds a copy button; nothing is shared by default.
  await expect(page.getByRole("button", { name: "Copy summary" })).toHaveCount(1); // the one in "Share or save"
  await page.getByLabel(/Share my symptom assessment/).check();
  await expect(page.getByRole("button", { name: "Copy summary" })).toHaveCount(2);

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download as PDF" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^ola-bot-centor_sore_throat-.*\.pdf$/);
});

test("a red flag stops the assessment and offers 911", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Start assessment" }).click();
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await expect(page).toHaveURL("/stop/chest_pain");
  await expect(page.getByRole("heading", { name: /SEEK EMERGENCY CARE/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Call 911" })).toHaveAttribute("href", "tel:911");
  await expect(page.getByRole("link", { name: "Find nearest ED" })).toBeVisible();
});

test("an emergency phrase in the complaint stops the flow", async ({ page }) => {
  await page.goto("/");
  await passSafetyChecks(page);
  await page.getByLabel("Main symptom").fill("chest pain when walking");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: /SEEK EMERGENCY CARE/ })).toBeVisible();
});

test("more than one missing answer blocks the result", async ({ page }) => {
  await page.goto("/");
  await passSafetyChecks(page);
  await page.getByLabel("Main symptom").fill("headache");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "No", exact: true }).click();
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Skip" }).click();
  await answer(page, "Yes");
  await expect(page.getByText("2 questions are unanswered.")).toBeVisible();
  await expect(page.getByRole("button", { name: "See my result" })).toBeDisabled();
});

test("unmatched complaint shows a menu", async ({ page }) => {
  await page.goto("/");
  await passSafetyChecks(page);
  await page.getByLabel("Main symptom").fill("itchy elbow");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "No exact match" })).toBeVisible();
});

test("rules library lists every rule with version and citation", async ({ page }) => {
  await page.goto("/rules");
  await expect(page.getByRole("heading", { name: "Rules library" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(17);
  await page.getByRole("link", { name: "Ankle and foot injury assessment" }).click();
  await expect(page.getByRole("heading", { name: "Ottawa Ankle Rules" })).toBeVisible();
  await expect(page).toHaveURL("/rules/ottawa_ankle");
  await expect(page).toHaveTitle("Ottawa Ankle Rules · OLA BOT");
  await expect(page.getByRole("heading", { name: "Version history" })).toBeVisible();
});

test("every step has its own URL, and back/reload work", async ({ page }) => {
  await page.goto("/");
  await passSafetyChecks(page);
  await expect(page).toHaveURL("/symptom");
  await page.getByLabel("Main symptom").fill("sore throat");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL("/assess/centor_sore_throat");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL("/assess/centor_sore_throat/warning/1");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "No", exact: true }).click();
  await expect(page).toHaveURL("/assess/centor_sore_throat/q/1");
  await answer(page, "15 to 44 years");
  await expect(page).toHaveURL("/assess/centor_sore_throat/q/2");
  await expect(page).toHaveTitle("Sore throat assessment: question 2 of 5 · OLA BOT");

  // Browser back returns to the previous question with the answer kept.
  await page.goBack();
  await expect(page).toHaveURL("/assess/centor_sore_throat/q/1");
  await expect(page.getByRole("radio", { name: "15 to 44 years" })).toBeChecked();

  // Reload keeps the session for this tab.
  await page.reload();
  await expect(page.getByRole("radio", { name: "15 to 44 years" })).toBeChecked();
  await page.getByRole("button", { name: /Next/ }).click();
  for (const a of ["Yes", "Yes", "Yes", "No"]) await answer(page, a);
  await expect(page).toHaveURL("/assess/centor_sore_throat/review");
  await page.getByRole("button", { name: "See my result" }).click();
  await expect(page).toHaveURL("/assess/centor_sore_throat/result");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Moderate likelihood of strep" })).toBeVisible();

  // Answers never appear in the URL.
  expect(page.url()).not.toMatch(/fever|yes|15_44/);
});

test("a deep link runs the safety check first, then returns to the requested page", async ({ page }) => {
  await page.goto("/assess/ottawa_knee");
  await expect(page).toHaveURL("/safety/1");
  for (let i = 0; i < 8; i++) await page.getByRole("button", { name: "No", exact: true }).click();
  await expect(page).toHaveURL("/assess/ottawa_knee");
  await expect(page.getByRole("heading", { name: /Mapping to: knee injury assessment/ })).toBeVisible();
});

test("result URL without a completed assessment redirects", async ({ page }) => {
  await page.goto("/assess/phq9/result");
  await expect(page).toHaveURL("/safety/1");
});

test("old hash links still work, unknown paths show not found", async ({ page }) => {
  await page.goto("/#/about");
  await expect(page).toHaveURL("/about");
  await expect(page.getByRole("heading", { name: "How OLA BOT works" })).toBeVisible();
  await page.goto("/no/such/page");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
