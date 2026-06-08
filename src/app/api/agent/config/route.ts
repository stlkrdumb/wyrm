import { NextResponse } from "next/server";

const INITIAL_CASH = Number(process.env.SIM_INITIAL_CASH) || 100000;

export async function GET() {
  return NextResponse.json({ initialCash: INITIAL_CASH });
}
