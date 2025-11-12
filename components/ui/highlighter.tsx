"use client"

import { useEffect, useRef } from "react"
import type React from "react"
import { useInView } from "motion/react"
import { annotate } from "rough-notation"
import { type RoughAnnotation } from "rough-notation/lib/model"

type AnnotationAction =
  | "highlight"
  | "underline"
  | "box"
  | "circle"
  | "strike-through"
  | "crossed-off"
  | "bracket"

interface HighlighterProps {
  children: React.ReactNode
  action?: AnnotationAction | AnnotationAction[]
  color?: string | string[]
  strokeWidth?: number
  animationDuration?: number
  iterations?: number
  padding?: number
  multiline?: boolean
  isView?: boolean
}

export function Highlighter({
  children,
  action = ["highlight", "underline"],
  color = ["#ffd1dc", "#10b981"],
  strokeWidth = 1.5,
  animationDuration = 600,
  iterations = 2,
  padding = 2,
  multiline = true,
  isView = false,
}: HighlighterProps) {
  const elementRef = useRef<HTMLSpanElement>(null)
  const annotationsRef = useRef<RoughAnnotation[]>([])

  const isInView = useInView(elementRef, {
    once: true,
    margin: "-10%",
  })

  // If isView is false, always show. If isView is true, wait for inView
  const shouldShow = !isView || isInView

  useEffect(() => {
    if (!shouldShow) return

    const element = elementRef.current
    if (!element) return

    // Normalize actions to array
    const actions = Array.isArray(action) ? action : [action]
    
    // Normalize colors to array, matching the number of actions
    const colors = Array.isArray(color) 
      ? color 
      : actions.map(() => color)

    // Create annotations for each action
    const annotations = actions.map((act, index) => {
      const annotationConfig = {
        type: act,
        color: colors[index] || colors[0],
        strokeWidth,
        animationDuration,
        iterations,
        padding,
        multiline,
      }

      return annotate(element, annotationConfig)
    })

    annotationsRef.current = annotations

    // Show all annotations
    annotations.forEach(annotation => {
      annotation.show()
    })

    const resizeObserver = new ResizeObserver(() => {
      annotations.forEach(annotation => {
        annotation.hide()
        annotation.show()
      })
    })

    resizeObserver.observe(element)
    resizeObserver.observe(document.body)

    return () => {
      if (element) {
        annotations.forEach(annotation => {
          annotation.remove()
        })
        resizeObserver.disconnect()
      }
    }
  }, [
    shouldShow,
    action,
    color,
    strokeWidth,
    animationDuration,
    iterations,
    padding,
    multiline,
  ])

  return (
    <span ref={elementRef} className="relative inline-block bg-transparent">
      {children}
    </span>
  )
}
