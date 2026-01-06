

export function formatCurrency(value) {
    return `$${value.toFixed(0)}`;
}

export function parseCurrency(value) {
    if (value === "" || value === null || value === undefined) {
        return 0;
    }
    else if (typeof value === "number") {
        return value;
    } else if (value.includes(".")) {
        value = value.split(".")[0];
    }
    if (value.charAt(0) === "$") {
        value = value.substring(1);
    }
    return parseFloat(value.replace(/[^0-9.-]+/g, ""));
}

export function goTo(to, from) {
    from.collapse()
    to.expand()
}
