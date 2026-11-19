type P = { className?: string };
const line = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", viewBox: "0 0 24 24", "aria-hidden": true } as const;
const solid = { fill: "currentColor", viewBox: "0 0 24 24", "aria-hidden": true } as const;

export const UploadIcon = ({ className }: P) => <svg {...line} className={className}><path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>;
export const FileIcon = ({ className }: P) => <svg {...line} className={className}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5" /></svg>;
export const CloseIcon = ({ className }: P) => <svg {...line} className={className}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const PlusIcon = ({ className }: P) => <svg {...line} className={className}><path d="M12 5v14M5 12h14" /></svg>;
export const MinusIcon = ({ className }: P) => <svg {...line} className={className}><path d="M5 12h14" /></svg>;
export const SunIcon = ({ className }: P) => <svg {...line} className={className}><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
export const MoonIcon = ({ className }: P) => <svg {...line} className={className}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>;
export const PlayIcon = ({ className }: P) => <svg {...solid} className={className}><path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z" /></svg>;
export const PauseIcon = ({ className }: P) => <svg {...solid} className={className}><path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z" /></svg>;
export const StopIcon = ({ className }: P) => <svg {...solid} className={className}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>;
export const NextIcon = ({ className }: P) => <svg {...solid} className={className}><path d="M5.5 5.8v12.4a.8.8 0 0 0 1.25.66l8.5-6.2a.8.8 0 0 0 0-1.32l-8.5-6.2a.8.8 0 0 0-1.25.66ZM17 5h2v14h-2z" /></svg>;
export const PrevIcon = ({ className }: P) => <svg {...solid} className={className}><path d="M18.5 5.8v12.4a.8.8 0 0 1-1.25.66l-8.5-6.2a.8.8 0 0 1 0-1.32l8.5-6.2a.8.8 0 0 1 1.25.66ZM5 5h2v14H5z" /></svg>;
export const SpinnerIcon = ({ className }: P) => <svg {...line} className={`animate-spin ${className ?? ""}`}><path d="M12 3a9 9 0 1 0 9 9" /></svg>;
export const MicIcon = ({ className }: P) => <svg {...line} className={className}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
export const SearchIcon = ({ className }: P) => <svg {...line} className={className}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
