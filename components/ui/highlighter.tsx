"use client"

import React from "react"
import { motion } from 'motion/react'

interface HighlighterProps {
  children: React.ReactNode
  color?: string
  type?: "underline" | "box" | "circle" | "highlight"
}

export const Highlighter = ({
  children,
  color = "var(--brand-green)",
  type = "underline"
}: HighlighterProps) => {

  if (type === "highlight") {
    return (
      <span className="relative inline-block px-1 mx-1">
        <motion.span
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: "circOut" }}
          className="absolute inset-0 -z-10 origin-left rounded-md opacity-30"
          style={{ backgroundColor: color }}
        />
        <span className="relative z-10">{children}</span>
      </span>
    )
  }

  return (
    <span className="relative inline-block">
      {children}
      <motion.span
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, ease: "circOut", delay: 0.2 }}
        className="absolute left-0 right-0 h-[0.1em] origin-left rounded-full opacity-40"
        style={{ backgroundColor: color, bottom: "0" }}
      />
    </span>
  )
}
