import { createHome } from './home';
import { createRelay } from './relay';
import { createStreet } from './street';

/** Prepare scene geometry between telemetry interactions, rather than during the covered cut. */
function preparedFactory<T>(create: () => T) {
  let prepared: T | undefined;
  let claimed = false;
  return {
    prepare() {
      if (!claimed && prepared === undefined) prepared = create();
    },
    take(): T {
      claimed = true;
      const resource = prepared ?? create();
      prepared = undefined;
      return resource;
    },
  };
}

const home = preparedFactory(createHome);
const street = preparedFactory(createStreet);
const relay = preparedFactory(createRelay);
let preparation: Promise<void> | undefined;

/** Yield between sets so the telemetry controls can still paint and receive input. */
export function preparePhaseSixEnvironments(): Promise<void> {
  preparation ??= (async () => {
    for (const environment of [relay, street, home]) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
      environment.prepare();
    }
  })();
  return preparation;
}

/** Transfer sole ownership to World; its existing cleanup disposes each set. */
export const takePreparedHome = () => home.take();
export const takePreparedStreet = () => street.take();
export const takePreparedRelay = () => relay.take();
