declare module 'pdf-parse' {
  interface PdfParseResult {
    text?: string
    numpages?: number
  }

  const parse: (buffer: Buffer) => Promise<PdfParseResult>
  export default parse
}

declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text?: string
    numpages?: number
  }

  const parse: (buffer: Buffer) => Promise<PdfParseResult>
  export default parse
}
