import { db, seedIfEmpty } from "../lib/db";

seedIfEmpty();
console.log(db.prepare("SELECT * FROM parents").all());
console.log(db.prepare("SELECT * FROM rules").all());