// Global mocks for all test files
// Note: @testing-library/jest-dom is imported in each test file directly

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = jest.fn()
  unobserve = jest.fn()
  disconnect = jest.fn()
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
})

// Mock window.open
Object.defineProperty(window, 'open', {
  writable: true,
  value: jest.fn(),
})

// Mock window.confirm
Object.defineProperty(window, 'confirm', {
  writable: true,
  value: jest.fn(() => true),
})
