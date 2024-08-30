export function formatDateString(timestamp) {
    const date = new Date(timestamp);
    return `${date.getUTCMonth() + 1}-${date.getUTCDate()}-${date.getUTCFullYear()}`
}

export function formatMonthString(timestamp) {
    const date = new Date(timestamp);
    return `${date.getUTCMonth() + 1}-${date.getUTCFullYear()}`
}