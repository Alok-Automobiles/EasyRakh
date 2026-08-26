import * as React from "react"

import { cn } from "@/lib/utils"

type InputProps = React.ComponentProps<"input">

const blockedNumberCharacters = new Set(["e", "E", "+"])
const blockedNumberStepKeys = new Set(["ArrowUp", "ArrowDown"])

function allowsNegativeNumber(min: InputProps["min"]) {
  if (min === undefined || min === null || min === "") return true
  const parsedMin = Number(min)
  return !Number.isFinite(parsedMin) || parsedMin < 0
}

function isIntegerNumberInput(step: InputProps["step"], inputMode: InputProps["inputMode"]) {
  if (inputMode === "numeric") return true
  if (step === undefined || step === null || step === "" || step === "any") return false

  const parsedStep = Number(step)
  return Number.isFinite(parsedStep) && Number.isInteger(parsedStep)
}

function getInputSelection(input: HTMLInputElement) {
  try {
    return {
      start: input.selectionStart ?? input.value.length,
      end: input.selectionEnd ?? input.value.length,
    }
  } catch {
    return {
      start: input.value.length,
      end: input.value.length,
    }
  }
}

function selectedTextIncludes(input: HTMLInputElement, value: string) {
  const { start, end } = getInputSelection(input)
  return input.value.slice(start, end).includes(value)
}

function isValidNumberCandidate(
  value: string,
  {
    min,
    step,
    inputMode,
  }: Pick<InputProps, "min" | "step" | "inputMode">
) {
  if (value === "") return true

  const sign = allowsNegativeNumber(min) ? "-?" : ""
  const integerOnly = isIntegerNumberInput(step, inputMode)
  const pattern = integerOnly
    ? new RegExp(`^${sign}\\d*$`)
    : new RegExp(`^${sign}\\d*(\\.\\d*)?$`)

  return pattern.test(value)
}

function shouldBlockNumberKey(
  event: React.KeyboardEvent<HTMLInputElement>,
  options: Pick<InputProps, "min" | "step" | "inputMode">
) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) {
    return false
  }

  if (blockedNumberCharacters.has(event.key)) return true

  if (event.key === "-") {
    if (!allowsNegativeNumber(options.min)) return true

    const { start } = getInputSelection(event.currentTarget)
    return start !== 0 || (event.currentTarget.value.includes("-") && !selectedTextIncludes(event.currentTarget, "-"))
  }

  if (event.key === "." || event.key === ",") {
    if (event.key === "," || isIntegerNumberInput(options.step, options.inputMode)) return true
    return event.currentTarget.value.includes(".") && !selectedTextIncludes(event.currentTarget, ".")
  }

  return !/^\d$/.test(event.key)
}

function Input({
  className,
  type,
  onKeyDown,
  onPaste,
  onWheel,
  min,
  step,
  inputMode,
  ...props
}: InputProps) {
  const isNumberInput = type === "number"

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (isNumberInput && blockedNumberStepKeys.has(event.key)) {
      event.preventDefault()
      return
    }

    if (isNumberInput && shouldBlockNumberKey(event, { min, step, inputMode })) {
      event.preventDefault()
      return
    }

    onKeyDown?.(event)
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    if (isNumberInput) {
      const pastedText = event.clipboardData.getData("text")
      const { start, end } = getInputSelection(event.currentTarget)
      const nextValue = `${event.currentTarget.value.slice(0, start)}${pastedText}${event.currentTarget.value.slice(end)}`

      if (!isValidNumberCandidate(nextValue, { min, step, inputMode })) {
        event.preventDefault()
        return
      }
    }

    onPaste?.(event)
  }

  const handleWheel = (event: React.WheelEvent<HTMLInputElement>) => {
    if (isNumberInput && document.activeElement === event.currentTarget) {
      // Blurring before the browser's default wheel action prevents native
      // number stepping while still allowing the page to keep scrolling.
      event.currentTarget.blur()
    }

    onWheel?.(event)
  }

  return (
    <input
      type={type}
      min={min}
      step={step}
      inputMode={inputMode}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-10 w-full min-w-0 rounded-lg border bg-card px-3 py-1 text-base text-foreground shadow-xs transition-[border-color,box-shadow] outline-none [color-scheme:light] file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-card dark:text-foreground dark:[color-scheme:dark]",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onWheel={handleWheel}
      {...props}
    />
  )
}

export { Input }
