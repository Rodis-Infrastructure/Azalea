export enum ErrorType {
    UnknownError = "UnknownError",
    CommandPublishError = "CommandPublishError",
    CommandRegisterError = "CommandRegisterError",
    ComponentRegisterError = "ComponentRegisterError"
}

interface BaseErrorProps {
    cause?: Error;
    name?: ErrorType;
}

export class BaseError extends Error {
    constructor(message: string, options?: BaseErrorProps) {
        super(message);

        this.name = options?.name ?? ErrorType.UnknownError;
        this.cause = options?.cause;
    }
}

export function ensureError(error: unknown): Error {
    if (error instanceof Error) {
        return error;
    }

    let stringifiedError = "Unknown error";

    if (typeof error === "object") {
        stringifiedError = JSON.stringify(error);
    } else if (error) {
        stringifiedError = error.toString();
    }

    return new Error(stringifiedError);
}