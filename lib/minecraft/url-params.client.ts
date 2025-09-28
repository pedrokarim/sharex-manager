/**
 * Utilitaire client pour gérer les paramètres URL avec nuqs
 */

import { useQueryState } from "nuqs";

export function useMinecraftSkinParams() {
  const [username, setUsername] = useQueryState("username", {
    defaultValue: "",
  });

  const [uuid, setUuid] = useQueryState("uuid", {
    defaultValue: "",
  });

  const [isSlim, setIsSlim] = useQueryState("slim", {
    defaultValue: false,
    parse: (value) => value === "true",
    serialize: (value) => value.toString(),
  });

  const [isAnimating, setIsAnimating] = useQueryState("animate", {
    defaultValue: true,
    parse: (value) => value === "true",
    serialize: (value) => value.toString(),
  });

  const [theta, setTheta] = useQueryState("theta", {
    defaultValue: 30,
    parse: (value) => parseFloat(value) || 30,
    serialize: (value) => value.toString(),
  });

  const [phi, setPhi] = useQueryState("phi", {
    defaultValue: 21,
    parse: (value) => parseFloat(value) || 21,
    serialize: (value) => value.toString(),
  });

  const [time, setTime] = useQueryState("time", {
    defaultValue: 90,
    parse: (value) => parseFloat(value) || 90,
    serialize: (value) => value.toString(),
  });

  return {
    username,
    setUsername,
    uuid,
    setUuid,
    isSlim,
    setIsSlim,
    isAnimating,
    setIsAnimating,
    theta,
    setTheta,
    phi,
    setPhi,
    time,
    setTime,
  };
}
