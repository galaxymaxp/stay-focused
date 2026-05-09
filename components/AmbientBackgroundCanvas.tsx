'use client'

import { useEffect, useRef } from 'react'

type HslColor = {
  h: number
  s: number
  l: number
}

type InteriorBlob = {
  ox: number
  oy: number
  radius: number
  speed: number
  phase: number
  wobbleX: number
  wobbleY: number
  hueOffset: number
  alpha: number
}

type EdgeBlob = {
  edge: 'top' | 'bottom' | 'left' | 'right'
  speed: number
  phase: number
  travel: number
  anchor: number
  radius: number
  hueOffset: number
  alpha: number
}

const INTERIOR_BLOBS: InteriorBlob[] = [
  { ox: 0.16, oy: 0.18, radius: 0.34, speed: 0.00011, phase: 0.2, wobbleX: 0.09, wobbleY: 0.07, hueOffset: 0, alpha: 0.24 },
  { ox: 0.82, oy: 0.16, radius: 0.29, speed: 0.00008, phase: 2.3, wobbleX: 0.07, wobbleY: 0.09, hueOffset: -10, alpha: 0.18 },
  { ox: 0.12, oy: 0.78, radius: 0.27, speed: 0.0001, phase: 4.1, wobbleX: 0.08, wobbleY: 0.06, hueOffset: 12, alpha: 0.17 },
  { ox: 0.88, oy: 0.72, radius: 0.32, speed: 0.00007, phase: 1.4, wobbleX: 0.06, wobbleY: 0.08, hueOffset: -18, alpha: 0.2 },
  { ox: 0.5, oy: 0.1, radius: 0.24, speed: 0.00013, phase: 3.6, wobbleX: 0.1, wobbleY: 0.05, hueOffset: 18, alpha: 0.15 },
  { ox: 0.48, oy: 0.9, radius: 0.26, speed: 0.00009, phase: 5.2, wobbleX: 0.07, wobbleY: 0.06, hueOffset: -24, alpha: 0.16 },
]

const EDGE_BLOBS: EdgeBlob[] = [
  { edge: 'top', speed: 0.00008, phase: 0.4, travel: 0.28, anchor: 0.48, radius: 0.2, hueOffset: 4, alpha: 0.2 },
  { edge: 'bottom', speed: 0.00007, phase: 2.5, travel: 0.3, anchor: 0.5, radius: 0.22, hueOffset: -12, alpha: 0.18 },
  { edge: 'left', speed: 0.00009, phase: 4.4, travel: 0.22, anchor: 0.52, radius: 0.19, hueOffset: 16, alpha: 0.16 },
  { edge: 'right', speed: 0.000075, phase: 1.7, travel: 0.24, anchor: 0.5, radius: 0.2, hueOffset: -20, alpha: 0.17 },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function wrapHue(hue: number) {
  return ((hue % 360) + 360) % 360
}

function parseCssColor(value: string): HslColor | null {
  const color = value.trim()
  const hexMatch = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)

  if (hexMatch) {
    const hex = hexMatch[1]
    const expanded = hex.length === 3
      ? hex.split('').map((part) => part + part).join('')
      : hex
    const r = Number.parseInt(expanded.slice(0, 2), 16)
    const g = Number.parseInt(expanded.slice(2, 4), 16)
    const b = Number.parseInt(expanded.slice(4, 6), 16)

    return rgbToHsl(r, g, b)
  }

  const rgbMatch = color.match(/^rgba?\(([^)]+)\)$/i)

  if (!rgbMatch) {
    return null
  }

  const channels = rgbMatch[1]
    .split(/[\s,\/]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((channel) => Number.parseFloat(channel))

  if (channels.length < 3 || channels.some((channel) => Number.isNaN(channel))) {
    return null
  }

  return rgbToHsl(channels[0], channels[1], channels[2])
}

function rgbToHsl(red: number, green: number, blue: number): HslColor {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) {
    return { h: 0, s: 0, l: l * 100 }
  }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0

  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0)
      break
    case g:
      h = (b - r) / d + 2
      break
    default:
      h = (r - g) / d + 4
      break
  }

  return { h: h * 60, s: s * 100, l: l * 100 }
}

function getAccentColor(): HslColor {
  const fallback = { h: 42, s: 67, l: 53 }

  if (typeof window === 'undefined') {
    return fallback
  }

  const styles = window.getComputedStyle(document.documentElement)
  return parseCssColor(styles.getPropertyValue('--accent')) ?? fallback
}

export function AmbientBackgroundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const context = canvas.getContext('2d')
    const root = document.documentElement
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    if (!context) {
      return
    }

    let width = 0
    let height = 0
    let animationFrame = 0
    let accent = getAccentColor()
    let isReducedMotion = motionQuery.matches

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const drawBlob = (
      cx: number,
      cy: number,
      radius: number,
      hueOffset: number,
      alpha: number,
      blur: number,
    ) => {
      const isDark = root.dataset.theme === 'dark'
      const hue = wrapHue(accent.h + hueOffset)
      const saturation = clamp(accent.s + 12, 46, 92)
      const lightness = isDark
        ? clamp(accent.l + 2, 42, 62)
        : clamp(accent.l + 4, 46, 68)
      const intensity = isDark ? 0.52 : 1
      const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius)

      gradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha * intensity})`)
      gradient.addColorStop(0.45, `hsla(${wrapHue(hue - 6)}, ${clamp(saturation - 10, 36, 86)}%, ${clamp(lightness - 7, 34, 64)}%, ${alpha * 0.58 * intensity})`)
      gradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness}%, 0)`)

      context.save()
      context.filter = `blur(${blur}px)`
      context.beginPath()
      context.arc(cx, cy, radius, 0, Math.PI * 2)
      context.fillStyle = gradient
      context.fill()
      context.restore()
    }

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height)

      if (width <= 0 || height <= 0) {
        return
      }

      const base = Math.min(width, height)

      INTERIOR_BLOBS.forEach((blob) => {
        const angle = time * blob.speed + blob.phase
        const wobbleX = Math.sin(angle * 1.37 + blob.phase) * width * blob.wobbleX
        const wobbleY = Math.cos(angle * 0.91 + blob.phase * 1.23) * height * blob.wobbleY
        const pulse = 1 + Math.sin(angle * 2.05 + blob.phase * 0.7) * 0.08
        drawBlob(
          blob.ox * width + wobbleX,
          blob.oy * height + wobbleY,
          base * blob.radius * pulse,
          blob.hueOffset,
          blob.alpha,
          48,
        )
      })

      EDGE_BLOBS.forEach((blob) => {
        const angle = time * blob.speed + blob.phase
        const drift = Math.sin(angle) * blob.travel
        const pulse = 1 + Math.sin(angle * 1.8 + blob.phase) * 0.1
        const radius = base * blob.radius * pulse
        let cx = 0
        let cy = 0

        if (blob.edge === 'top') {
          cx = width * clamp(blob.anchor + drift, 0.12, 0.88)
          cy = -radius * 0.1
        } else if (blob.edge === 'bottom') {
          cx = width * clamp(blob.anchor - drift, 0.12, 0.88)
          cy = height + radius * 0.1
        } else if (blob.edge === 'left') {
          cx = -radius * 0.1
          cy = height * clamp(blob.anchor + drift, 0.14, 0.86)
        } else {
          cx = width + radius * 0.1
          cy = height * clamp(blob.anchor - drift, 0.14, 0.86)
        }

        drawBlob(cx, cy, radius, blob.hueOffset, blob.alpha, 40)
      })
    }

    const animate = (time: number) => {
      draw(time)
      animationFrame = window.requestAnimationFrame(animate)
    }

    const render = () => {
      window.cancelAnimationFrame(animationFrame)
      accent = getAccentColor()
      resize()

      if (isReducedMotion) {
        draw(performance.now())
        return
      }

      animationFrame = window.requestAnimationFrame(animate)
    }

    const resizeObserver = new ResizeObserver(render)
    const mutationObserver = new MutationObserver(render)

    resizeObserver.observe(canvas)
    mutationObserver.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-accent', 'style'],
    })

    const handleMotionChange = (event: MediaQueryListEvent) => {
      isReducedMotion = event.matches
      render()
    }

    motionQuery.addEventListener('change', handleMotionChange)
    render()

    return () => {
      window.cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      motionQuery.removeEventListener('change', handleMotionChange)
    }
  }, [])

  return <canvas ref={canvasRef} className="app-ambient-canvas" aria-hidden="true" />
}
