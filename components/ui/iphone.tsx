import type { HTMLAttributes } from "react"

const PHONE_WIDTH = 433
const PHONE_HEIGHT = 882
const SCREEN_X = 21.25
const SCREEN_Y = 19.25
const SCREEN_WIDTH = 389.5
const SCREEN_HEIGHT = 843.5
const SCREEN_RADIUS = 55.75

// Calculated percentages
const LEFT_PCT = (SCREEN_X / PHONE_WIDTH) * 100
const TOP_PCT = (SCREEN_Y / PHONE_HEIGHT) * 100
const WIDTH_PCT = (SCREEN_WIDTH / PHONE_WIDTH) * 100
const HEIGHT_PCT = (SCREEN_HEIGHT / PHONE_HEIGHT) * 100
const RADIUS_H = (SCREEN_RADIUS / SCREEN_WIDTH) * 100
const RADIUS_V = (SCREEN_RADIUS / SCREEN_HEIGHT) * 100

export interface IphoneProps extends HTMLAttributes<HTMLDivElement> {
  src?: string
  videoSrc?: string
}

export function Iphone({
  src,
  videoSrc,
  className,
  style,
  ...props
}: IphoneProps) {
  const hasVideo = !!videoSrc
  const hasMedia = hasVideo || !!src

  return (
    <div
      className={`relative inline-block w-full align-middle leading-none ${className}`}
      style={{
        aspectRatio: `${PHONE_WIDTH}/${PHONE_HEIGHT}`,
        ...style,
      }}
      {...props}
    >
      {/* Screen Content */}
      {hasVideo && (
        <div
          className="pointer-events-none absolute z-0 overflow-hidden"
          style={{
            left: `${LEFT_PCT}%`,
            top: `${TOP_PCT}%`,
            width: `${WIDTH_PCT}%`,
            height: `${HEIGHT_PCT}%`,
            borderRadius: `${RADIUS_H}% / ${RADIUS_V}%`,
          }}
        >
          <video
            className="block size-full object-cover"
            src={videoSrc}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
          />
        </div>
      )}

      {!hasVideo && src && (
        <div
          className="pointer-events-none absolute z-0 overflow-hidden"
          style={{
            left: `${LEFT_PCT}%`,
            top: `${TOP_PCT}%`,
            width: `${WIDTH_PCT}%`,
            height: `${HEIGHT_PCT}%`,
            borderRadius: `${RADIUS_H}% / ${RADIUS_V}%`,
          }}
        >
          <img
            src={src}
            alt=""
            className="block size-full object-cover object-top"
          />
        </div>
      )}

      {/* Phone Frame SVG */}
      <svg
        viewBox={`0 0 ${PHONE_WIDTH} ${PHONE_HEIGHT}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 size-full drop-shadow-2xl"
        style={{ transform: "translateZ(0)" }}
      >
        <g mask={hasMedia ? "url(#screenPunch)" : undefined}>
          {/* Main Body */}
          <path
            d="M2 73C2 32.6832 34.6832 0 75 0H357C397.317 0 430 32.6832 430 73V809C430 849.317 397.317 882 357 882H75C34.6832 882 2 849.317 2 809V73Z"
            className="fill-[#282828]"
          />
          {/* Side Buttons */}
          <path
            d="M0 171C0 170.448 0.447715 170 1 170H3V204H1C0.447715 204 0 203.552 0 203V171Z"
            className="fill-[#1a1a1a]"
          />
          <path
            d="M1 234C1 233.448 1.44772 233 2 233H3.5V300H2C1.44772 300 1 299.552 1 299V234Z"
            className="fill-[#1a1a1a]"
          />
          <path
            d="M1 319C1 318.448 1.44772 318 2 318H3.5V385H2C1.44772 385 1 384.552 1 384V319Z"
            className="fill-[#1a1a1a]"
          />
          <path
            d="M430 279H432C432.552 279 433 279.448 433 280V384C433 384.552 432.552 385 432 385H430V279Z"
            className="fill-[#1a1a1a]"
          />
          
          {/* Outer Rim / Bezel */}
          <path
            d="M6 74C6 35.3401 37.3401 4 76 4H356C394.66 4 426 35.3401 426 74V808C426 846.66 394.66 878 356 878H76C37.3401 878 6 846.66 6 808V74Z"
            className="fill-[#000000]"
          />
        </g>

        {/* Inner Border / Screen Edge */}
        <path
          d={`M${SCREEN_X} 75C${SCREEN_X} 44.2101 46.2101 ${SCREEN_Y} 77 ${SCREEN_Y}H355C385.79 ${SCREEN_Y} 410.75 44.2101 410.75 75V807C410.75 837.79 385.79 862.75 355 862.75H77C46.2101 862.75 ${SCREEN_X} 837.79 ${SCREEN_X} 807V75Z`}
          className="fill-none stroke-[#333333] stroke-[2]"
          mask={hasMedia ? "url(#screenPunch)" : undefined}
        />

        {/* Dynamic Island / Notch Area */}
        <path
          d="M154 48.5C154 38.2827 162.283 30 172.5 30H259.5C269.717 30 278 38.2827 278 48.5C278 58.7173 269.717 67 259.5 67H172.5C162.283 67 154 58.7173 154 48.5Z"
          className="fill-black"
        />
        
        {/* Camera Lens Reflection */}
        <circle cx="260" cy="48" r="4" fill="#1a1a2e" />
        <circle cx="260" cy="48" r="1.5" fill="#2d2d42" />

        {/* Speaker Grill */}
        <path
          d="M205 20H227"
          stroke="#1a1a1a"
          strokeWidth="2"
          strokeLinecap="round"
        />

        <defs>
          <mask id="screenPunch" maskUnits="userSpaceOnUse">
            <rect
              x="0"
              y="0"
              width={PHONE_WIDTH}
              height={PHONE_HEIGHT}
              fill="white"
            />
            <rect
              x={SCREEN_X}
              y={SCREEN_Y}
              width={SCREEN_WIDTH}
              height={SCREEN_HEIGHT}
              rx={SCREEN_RADIUS}
              ry={SCREEN_RADIUS}
              fill="black"
            />
          </mask>
        </defs>
      </svg>
      
      {/* Glossy Reflection Overlay */}
      <div className="absolute inset-0 rounded-[3rem] pointer-events-none bg-gradient-to-tr from-white/5 to-transparent opacity-40" style={{
         left: `${LEFT_PCT}%`,
         top: `${TOP_PCT}%`,
         width: `${WIDTH_PCT}%`,
         height: `${HEIGHT_PCT}%`,
         borderRadius: `${RADIUS_H}% / ${RADIUS_V}%`,
      }}/>
    </div>
  )
}
