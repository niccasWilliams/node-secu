
export type FrontendUser = {
    id: number;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
}

export type RequestResponce = {
    success: boolean,
    message: string,
    data: any
}

export type GenericRequestResponse<T = any> = {
    success: boolean;
    message: string;
    data?: T;
};


export type PaginatedResult<T> = {
    items: T[]           // die eigentlichen Daten
    page: number         // aktuelle Seite (1-basiert)
    pageSize: number     // Größe pro Seite
    total: number        // gesamt gefundene Items
    totalPages: number   // max Seitenzahl
    hasNextPage: boolean
    hasPrevPage: boolean
}


export type FileData = {
    field?: string;              // optional, wenn aus single-legacy kommt
    fileName: string;
    mimeType: string;
    fileBuffer: Buffer;
    size?: number;
};



export type Languages = "DE" | "EN" | "FR" | "ES";
export const REQUIRED_LANG_COUNT = 2;
export type Currency = "EUR";



