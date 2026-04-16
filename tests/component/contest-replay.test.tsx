import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContestReplay } from "@/components/contest/contest-replay";

describe("ContestReplay", () => {
  it("renders replay snapshots and updates the table when the slider moves", () => {
    render(
      <ContestReplay
        title="Contest replay"
        description="Scrub through the standings."
        noDataLabel="No data"
        timelineLabel="Timeline"
        playLabel="Play"
        pauseLabel="Pause"
        speedLabel="Speed"
        rankLabel="Rank"
        nameLabel="Name"
        totalScoreLabel="Score"
        penaltyLabel="Penalty"
        snapshots={[
          {
            label: "0m",
            entries: [{ userId: "u1", name: "Alice", rank: 1, totalScoreLabel: "100", penaltyLabel: "10" }],
          },
          {
            label: "15m",
            entries: [{ userId: "u2", name: "Bob", rank: 1, totalScoreLabel: "200", penaltyLabel: "5" }],
          },
        ]}
      />
    );

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("0m")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Timeline"), { target: { value: "1" } });

    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("15m")).toBeInTheDocument();
  });
});
