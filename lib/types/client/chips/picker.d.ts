import { statsFor } from '../state/resolve.ts';
import type { Snapshot } from '../contract/types.ts';
export interface ChipProps {
    sessionId?: string | null;
    session?: {
        id?: unknown;
        sessionId?: unknown;
    } | null;
}
export declare function usePicker(props: ChipProps, options?: {
    fallbackBlank?: boolean;
}): {
    snapshot: Snapshot | null;
    sessionId: string | null;
    current: import("../contract/types.ts").Profile | null;
    currentId: string;
    chips: {
        id: string;
        name: string;
        desc: string;
        stats: ReturnType<typeof statsFor> | null;
    }[];
    open: boolean;
    setOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
    anchor: import("react").MutableRefObject<HTMLElement | null>;
    choose: (profileId: string) => Promise<void>;
};
