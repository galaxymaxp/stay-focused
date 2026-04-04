import * as React from "react";

type StayFocusedIconProps = React.SVGProps<SVGSVGElement> & {
  size?: number | string;
  color?: string;
};

export function StayFocusedIcon({
  size = 24,
  color = "currentColor",
  ...props
}: StayFocusedIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <g
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M52 62V190" />
        <path d="M204 62V190" />
        <path d="M60 68C86 68 104 73 128 95C152 73 170 68 196 68" />
        <path d="M60 182C86 182 104 187 128 206C152 187 170 182 196 182" />
        <path d="M72 84C94 84 108 89 128 106C148 89 162 84 184 84" />
        <path d="M72 164C94 164 108 169 128 186C148 169 162 164 184 164" />
        <path d="M72 84V164" />
        <path d="M184 84V164" />
        <path d="M118 197L128 206L138 197" />
        <path d="M100 124L121 145L160 104" />
        <path d="M192 102H192.2" />
        <path d="M192 126H192.2" />
      </g>
    </svg>
  );
}

export default StayFocusedIcon;
