import React from 'react';

export const SatelliteIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.125 10.375L6.875 16.625m.375-9.375a4.5 4.5 0 116.364 6.364l.875.875a6.75 6.75 0 10-9.546-9.546l.875.875z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.125 10.375L16.625 6.875m0 0l-3.75 3.75M16.625 6.875L20.25 10.5m-3.625-3.625L10.5 3.75m6.125 3.125L18.375 9" />
    </svg>
);
