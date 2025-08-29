import React from 'react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
    title?: string;
}

export const RotationIcon: React.FC<IconProps> = ({ title, ...props }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        {title && <title>{title}</title>}
        <path d="M21.5 2v6h-6" />
        <path d="M2.5 22v-6h6" />
        <path d="M2 11.5A10 10 0 0 1 12 2a10 10 0 0 1 10 10" />
        <path d="M22 12.5a10 10 0 0 1-10 10a10 10 0 0 1-10-10" />
    </svg>
);