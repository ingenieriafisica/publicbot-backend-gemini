export interface ChatResponse {
    respuesta: string;
    fuentes: FuenteRag[];
    pregunta: string;
    modelo: string;
    tiempoProcesamiento: number;
    topRerank: number;
}
export interface FuenteRag {
    contenido: string;
    metadatos: Record<string, any>;
    puntuacion?: number;
    indiceRerank?: number;
}