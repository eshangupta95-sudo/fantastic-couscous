import { createHash } from 'crypto';
export function hashContent(content) {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
}
export function hashFile(filePath, content) {
    return createHash('sha256')
        .update(filePath + content)
        .digest('hex')
        .slice(0, 16);
}
//# sourceMappingURL=hash.js.map