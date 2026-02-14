declare module 'canvas-confetti' {
  interface Options {
    particleCount?: number
    spread?: number
    origin?: { x: number; y: number }
    colors?: string[]
    angle?: number
    startVelocity?: number
    gravity?: number
    drift?: number
    ticks?: number
    decay?: number
    scalar?: number
    zIndex?: number
    disableForReducedMotion?: boolean
  }

  function confetti(options?: Options): Promise<null>
  
  export = confetti
}


