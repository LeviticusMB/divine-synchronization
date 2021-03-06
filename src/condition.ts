import Deque from 'denque';
import { DRRData, DRRQueue } from './drr-queue';

export interface BackingQueue<T, W> {
    readonly length: number;

    push(data: W): number;
    shift(): T | undefined
}

interface Waiter<T> {
    callback: (value: T) => void;
    aborted:  boolean;
}

export class SignalBase<T, W> {
    private _value: T | undefined;

    constructor(private _waiters: BackingQueue<Waiter<T>, W>) {}

    get value(): T | undefined {
        return this._value;
    }

    notify(value: T): boolean {
        if (value === undefined) {
            throw new TypeError(`Signal cannot send 'undefined'`);
        }

        this._value = value;

        for (let waiter = this._waiters.shift(); waiter; waiter = this._waiters.shift()) {
            if (!waiter.aborted) {
                waiter.callback(value);
                return true;
            }
        }

        return false;
    }

    notifyAll(value: T): boolean {
        let rc = false;

        while (this.notify(value)) {
            rc = true;
        }

        return rc;
    }

    protected _wait(makeQueueData: (waiter: Waiter<T>) => W, timeout?: number): Promise<T | undefined> {
        return new Promise<T | undefined>((resolve) => {
            let timer = undefined as any;

            const waiter: Waiter<T> = {
                callback: (value: T) => {
                    clearTimeout(timer);
                    resolve(value);
                },

                aborted: false,
            };

            if (timeout !== undefined) {
                timer = setTimeout(() => {
                    timer = undefined;
                    waiter.aborted = true;
                    resolve(undefined);
                }, timeout);
            }

            this._waiters.push(makeQueueData(waiter));
        });
    }
}

export class Signal<T> extends SignalBase<T, Waiter<T>> {
    constructor() {
        super(new Deque<Waiter<T>>());
    }

    wait(): Promise<T>;
    wait(timeout?: number): Promise<T | undefined>;
    wait(timeout?: number): Promise<T | undefined> {
        return this._wait((w) => w, timeout);
    }
}

export class FairSignal<T> extends SignalBase<T, DRRData<Waiter<T>>> {
    constructor() {
        super(new DRRQueue<Waiter<T>>());
    }

    wait(id: string): Promise<T>;
    wait(id: string, timeout?: number): Promise<T | undefined>;
    wait(id: string, timeout?: number): Promise<T | undefined> {
        return this._wait((w) => {
            if (typeof id !== 'string') {
                throw new TypeError(`Flow ID must be a string; got ${typeof id}`);
            }

            return ({ id, data: w, size: 1 })
        }, timeout);
    }
}

export class Condition {
    private _signal = new Signal<true>();

    notify(): boolean {
        return this._signal.notify(true);
    }

    notifyAll(): boolean {
        return this._signal.notifyAll(true);
    }

    wait(): Promise<true>;
    wait(timeout?: number): Promise<boolean>;
    wait(timeout?: number): Promise<boolean> {
        return this._signal.wait(timeout).then((value) => value !== undefined);
    }
}

export class FairCondition {
    private _signal = new FairSignal<true>();

    notify(): boolean {
        return this._signal.notify(true);
    }

    notifyAll(): boolean {
        return this._signal.notifyAll(true);
    }

    wait(id: string): Promise<true>;
    wait(id: string, timeout?: number): Promise<boolean>;
    wait(id: string, timeout?: number): Promise<boolean> {
        return this._signal.wait(id, timeout).then((value) => value !== undefined);
    }
}
