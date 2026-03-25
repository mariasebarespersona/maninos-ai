import { Page, Locator, expect } from "@playwright/test";

export class MarketPage {
  readonly page: Page;

  // Page-level locators
  readonly marketTitle: Locator;
  readonly qualifiedBadge: Locator;
  readonly filtersToggle: Locator;
  readonly filterBar: Locator;
  readonly refreshBtn: Locator;
  readonly marketAnalysis: Locator;

  // Filter locators
  readonly filterPriceMin: Locator;
  readonly filterPriceMax: Locator;
  readonly filterBedrooms: Locator;
  readonly filterYearMin: Locator;
  readonly filterYearMax: Locator;
  readonly filterSource: Locator;
  readonly clearFiltersLink: Locator;
  readonly searchButton: Locator;

  // Listings locators
  readonly listingsGrid: Locator;
  readonly listingCards: Locator;
  readonly sourceBadges: Locator;
  readonly qualBadges: Locator;
  readonly listingPrices: Locator;
  readonly negotiateButtons: Locator;
  readonly viewOriginalLinks: Locator;
  readonly reviewButtons: Locator;
  readonly dismissButtons: Locator;
  readonly negotiatingBadges: Locator;

  constructor(page: Page) {
    this.page = page;

    // Page-level
    this.marketTitle = page.getByTestId("market-title");
    this.qualifiedBadge = page.getByTestId("qualified-badge");
    this.filtersToggle = page.getByTestId("filters-toggle");
    this.filterBar = page.getByTestId("filter-bar");
    this.refreshBtn = page.getByTestId("refresh-btn");
    this.marketAnalysis = page.getByTestId("market-analysis");

    // Filters
    this.filterPriceMin = page.getByTestId("filter-price-min");
    this.filterPriceMax = page.getByTestId("filter-price-max");
    this.filterBedrooms = page.getByTestId("filter-bedrooms");
    this.filterYearMin = page.getByTestId("filter-year-min");
    this.filterYearMax = page.getByTestId("filter-year-max");
    this.filterSource = page.getByTestId("filter-source");
    this.clearFiltersLink = page.getByTestId("clear-filters");
    this.searchButton = page.getByTestId("search-button");

    // Listings
    this.listingsGrid = page.getByTestId("listings-grid");
    this.listingCards = page.getByTestId("listing-card");
    this.sourceBadges = page.getByTestId("source-badge");
    this.qualBadges = page.getByTestId("qual-badge");
    this.listingPrices = page.getByTestId("listing-price");
    this.negotiateButtons = page.getByTestId("negotiate-btn");
    this.viewOriginalLinks = page.getByTestId("view-original");
    this.reviewButtons = page.getByTestId("review-btn");
    this.dismissButtons = page.getByTestId("dismiss-btn");
    this.negotiatingBadges = page.getByTestId("negotiating-badge");
  }

  /** Navigate to the Casas del Mercado page */
  async goto() {
    await this.page.goto("/homes/market");
  }

  /** Assert the page title is visible */
  async isLoaded() {
    await expect(this.marketTitle).toBeVisible();
  }

  /** Dismiss the Joyride tour overlay if it appears */
  async dismissTour() {
    const skipButton = this.page.locator(
      'button[data-action="skip"], [aria-label="Skip"], button:has-text("Skip")'
    );
    try {
      await skipButton.click({ timeout: 3000 });
    } catch {
      // Tour not present — nothing to dismiss
    }
  }

  /** Expand the filter bar */
  async openFilters() {
    // Only click if the filter bar is not already visible
    if (!(await this.filterBar.isVisible().catch(() => false))) {
      await this.filtersToggle.click();
    }
    await expect(this.filterBar).toBeVisible();
  }

  /** Collapse the filter bar */
  async closeFilters() {
    if (await this.filterBar.isVisible().catch(() => false)) {
      await this.filtersToggle.click();
    }
    await expect(this.filterBar).toBeHidden();
  }

  /** Select a value in the bedrooms dropdown */
  async setBedroomsFilter(value: string) {
    await this.filterBedrooms.selectOption(value);
  }

  /** Fill both min and max price inputs */
  async setPriceRange(min: string, max: string) {
    await this.filterPriceMin.fill(min);
    await this.filterPriceMax.fill(max);
  }

  /** Fill both min and max year inputs */
  async setYearRange(min: string, max: string) {
    await this.filterYearMin.fill(min);
    await this.filterYearMax.fill(max);
  }

  /** Select a value in the source dropdown */
  async setSourceFilter(value: string) {
    await this.filterSource.selectOption(value);
  }

  /** Click the "clear filters" link */
  async clearFilters() {
    await this.clearFiltersLink.click();
  }

  /** Wait for listing cards to appear after an API response */
  async waitForListings() {
    await this.page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/market-listings") && resp.status() === 200
    );
    await this.listingCards.first().waitFor({ state: "visible" });
  }

  /** Return the number of visible listing cards */
  async getListingCount(): Promise<number> {
    return this.listingCards.count();
  }

  /** Return an array of all visible listing price texts */
  async getListingPrices(): Promise<string[]> {
    return this.listingPrices.allTextContents();
  }

  /** Return an array of all visible source badge texts */
  async getListingSources(): Promise<string[]> {
    return this.sourceBadges.allTextContents();
  }

  /** Return the count of "En Negociacion" badges */
  async getNegotiatingCount(): Promise<number> {
    return this.negotiatingBadges.count();
  }

  /** Click the negotiate button on the nth listing card (0-based) */
  async clickNegotiate(index: number) {
    await this.negotiateButtons.nth(index).click();
  }

  /** Click the search button and wait for the API response */
  async clickSearch() {
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/market-listings") && resp.status() === 200
    );
    await this.searchButton.click();
    await responsePromise;
  }

  /** Return the qualified badge text content */
  async getBadgeText(): Promise<string> {
    return (await this.qualifiedBadge.textContent()) ?? "";
  }

  /** Return the search button text content */
  async getSearchButtonText(): Promise<string> {
    return (await this.searchButton.textContent()) ?? "";
  }

  /** Check whether "Rango Precio" text is present on the page */
  async hasRangoPrecio(): Promise<boolean> {
    return this.page.getByText("Rango Precio").isVisible();
  }

  /** Get the spec field values for a given listing card (0-based index) */
  async getSpecFields(cardIndex: number) {
    const card = this.listingCards.nth(cardIndex);
    const bedrooms = await card
      .getByTestId("spec-manual_bedrooms")
      .textContent();
    const bathrooms = await card
      .getByTestId("spec-manual_bathrooms")
      .textContent();
    const sqft = await card.getByTestId("spec-manual_sqft").textContent();
    const year = await card.getByTestId("spec-manual_year").textContent();
    return {
      bedrooms: bedrooms ?? "",
      bathrooms: bathrooms ?? "",
      sqft: sqft ?? "",
      year: year ?? "",
    };
  }

  /** Click the pencil edit button for a spec field, type a value, and confirm with Enter */
  async editSpecField(cardIndex: number, field: string, value: string) {
    const card = this.listingCards.nth(cardIndex);
    await card.getByTestId(`edit-${field}`).click();
    const input = card.getByTestId(`edit-${field}`).locator("input");
    // Fallback: if the input appears as a sibling or child of the card after clicking
    const activeInput = (await input.isVisible())
      ? input
      : card.locator(`input[name="${field}"], input`).first();
    await activeInput.fill(value);
    await activeInput.press("Enter");
  }
}
