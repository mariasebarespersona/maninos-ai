import { Page } from "@playwright/test";

const SUPABASE_URL = "https://tpsszoxyqdutqlwfgrvm.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwc3N6b3h5cWR1dHFsd2ZncnZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTEwODcsImV4cCI6MjA4NTA4NzA4N30.NNaIewOfNdTP1qrciMaWq_ZPYv6Li4q0_g27nBD-2Dw";

interface SupabaseTokens {
  access_token: string;
  refresh_token: string;
}

/**
 * Authenticate directly against the Supabase REST API.
 * Returns access and refresh tokens that can be injected into localStorage
 * or used as Bearer tokens for API calls.
 */
export async function supabaseLogin(
  email: string,
  password: string
): Promise<SupabaseTokens> {
  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Supabase login failed (${response.status}): ${body}`
    );
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  };
}

/**
 * Log in through the browser by filling the login form and waiting for
 * navigation to complete. Assumes the app redirects to a dashboard page
 * after successful authentication.
 */
export async function loginViaBrowser(
  page: Page,
  email: string,
  password: string
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /iniciar sesión|sign in|login/i }).click();
  // Wait for navigation away from the login page
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15000,
  });
}
