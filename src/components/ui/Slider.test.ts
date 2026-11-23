import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Slider } from "./Slider";

const render = (props: Partial<Parameters<typeof Slider>[0]>) =>
  renderToStaticMarkup(createElement(Slider, { value: 83, max: 200, onChange: () => {}, label: "Posição", ...props }));

describe("Slider", () => {
  it("announces the percentage by default", () => {
    expect(render({})).toContain('aria-valuetext="42%"');
  });

  it("announces a custom value text, e.g. the playback time", () => {
    expect(render({ valueText: "1:23 / 3:20" })).toContain('aria-valuetext="1:23 / 3:20"');
  });
});
