import { describe, it, expect } from "vitest";
import { evaluateAndroidExtendedChecks, concatenatedSql } from "../android-app-extended";
import type { RepoSnapshot } from "../native-mobile";

const MANIFEST = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:allowBackup="true" android:name=".App"></application>
</manifest>`;

function snapshot(files: Record<string, string>): RepoSnapshot {
  const all = { "app/src/main/AndroidManifest.xml": MANIFEST, ...files };
  return {
    owner: "acme",
    repo: "app",
    paths: Object.keys(all),
    files: new Map(Object.entries(all)),
    truncated: false,
    accessible: true,
  };
}

const find = (files: Record<string, string>, key: string) =>
  evaluateAndroidExtendedChecks(snapshot(files)).find((c) => c.checkKey === key)!;

describe("android_x_code_shrinking", () => {
  it("passes Now in Android's property-driven toggle that defaults to true", () => {
    const gradle = `android {
    buildTypes {
        release {
            isMinifyEnabled = providers.gradleProperty("minifyWithR8")
                .map(String::toBooleanStrict).getOrElse(true)
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}`;
    expect(find({ "app/build.gradle.kts": gradle }, "android_x_code_shrinking").status).toBe("PASS");
  });

  it("still warns on kickstarter's explicit minifyEnabled false", () => {
    const gradle = `android {
    buildTypes {
        release {
            minifyEnabled false
            signingConfig signingConfigs.debug
        }
    }
}`;
    expect(find({ "app/build.gradle": gradle }, "android_x_code_shrinking").status).toBe("WARN");
  });

  it("passes an Elvis-default toggle (?: true)", () => {
    const gradle = `release {
    isMinifyEnabled = findProperty("r8")?.toString()?.toBoolean() ?: true
}`;
    expect(find({ "app/build.gradle.kts": gradle }, "android_x_code_shrinking").status).toBe("PASS");
  });

  it("still warns when the property toggle defaults to false", () => {
    const gradle = `release {
    isMinifyEnabled = providers.gradleProperty("minify")
        .map(String::toBooleanStrict).getOrElse(false)
}`;
    expect(find({ "app/build.gradle.kts": gradle }, "android_x_code_shrinking").status).toBe("WARN");
  });
});

describe("android_x_root_debug_detection", () => {
  it("does not flag a negated debug flag that restricts to debug builds (kickstarter SettingsActivity)", () => {
    const src = `class SettingsActivity {
    fun bind() {
        this.viewModel.isUserPresent.subscribe { isPresent ->
            binding.editProfileRow.isGone = !BuildConfig.DEBUG || !isPresent
        }
    }
}`;
    expect(find({ "app/src/main/java/SettingsActivity.kt": src }, "android_x_root_debug_detection").status).toBe("PASS");
  });

  it("still flags a widening BuildConfig.DEBUG || guard", () => {
    const src = `class Api {
    fun skipPinning(prefs: SharedPreferences) = BuildConfig.DEBUG || prefs.getBoolean("dev_mode", false)
}`;
    expect(find({ "app/src/main/java/Api.kt": src }, "android_x_root_debug_detection").status).toBe("WARN");
  });
});

describe("android_x_screenshot_flag", () => {
  it("does not claim a news reader handles credentials because of Compose Card and image-URL tokens", () => {
    const src = `@Composable
fun NewsResourceCardExpanded() {
    Card(colors = CardDefaults.cardColors()) {}
}
val topic = Topic(imageUrl = "https://firebasestorage.googleapis.com/v0/b/now-in-android.appspot.com/o/img%2Fic_topic_UI.svg?alt=media&token=0ee1842b-12e8-435f-87ba-a5bb02c47594")`;
    expect(find({ "core/ui/NewsResourceCard.kt": src }, "android_x_screenshot_flag").status).toBe("SKIPPED");
  });

  it("does not treat a YouTube PoToken as a credential screen", () => {
    const src = `class PoTokenWebView { fun generatePoToken(identifier: String) {} val integrityToken = "" }`;
    expect(find({ "app/src/main/java/PoTokenWebView.kt": src }, "android_x_screenshot_flag").status).toBe("SKIPPED");
  });

  it("still warns on a password and card entry screen without FLAG_SECURE", () => {
    const src = `@Composable
fun LoginScreen() {
    OutlinedTextField(value = password, onValueChange = {}, visualTransformation = PasswordVisualTransformation())
}
class NewCardFragment { lateinit var cardInput: CardInputWidget; val cvc = "" }`;
    expect(find({ "app/src/main/java/LoginScreen.kt": src }, "android_x_screenshot_flag").status).toBe("WARN");
  });

  it("still warns on a View-based login screen whose password field lives in layout XML", () => {
    const src = `class LoginActivity {
    fun submit() {
        val pw = binding.passwordInput.text.toString()
        val v = findViewById<EditText>(R.id.et_password)
        api.login(email, pw)
    }
}`;
    expect(find({ "app/src/main/java/LoginActivity.kt": src }, "android_x_screenshot_flag").status).toBe("WARN");
  });

  it("still warns on a one-time-code entry field", () => {
    const src = `class VerifyFragment { lateinit var otpCode: EditText; fun send() { verify(otpCode.text) } }`;
    expect(find({ "app/src/main/java/VerifyFragment.kt": src }, "android_x_screenshot_flag").status).toBe("WARN");
  });

  it("passes the same screen when FLAG_SECURE is set", () => {
    const src = `fun LoginScreen() { visualTransformation = PasswordVisualTransformation() }
fun onCreate() { window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE) }`;
    expect(find({ "app/src/main/java/LoginScreen.kt": src }, "android_x_screenshot_flag").status).toBe("PASS");
  });
});

describe("android_x_sql_raw_query", () => {
  it("does not fail on DDL built from static final constants (NewPipe FinishedMissionStore)", () => {
    const src = `public class FinishedMissionStore extends SQLiteOpenHelper {
    private static final String MISSIONS_TABLE_NAME_v2 = "download_missions";
    private static final String KEY_KIND = "kind";
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        db.execSQL("ALTER TABLE " + MISSIONS_TABLE_NAME_v2 + " ADD COLUMN " + KEY_KIND + " TEXT;");
        db.execSQL("DROP TABLE " + MISSIONS_TABLE_NAME_v2);
    }
}`;
    expect(concatenatedSql(src)).toBe(false);
    expect(find({ "app/src/main/java/FinishedMissionStore.java": src }, "android_x_sql_raw_query").status).toBe("PASS");
  });

  it("does not fail on literal-only concatenation in a migration", () => {
    const src = `val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS \`streams\` " +
                "(\`uid\` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL)"
        )
    }
}`;
    expect(find({ "app/src/main/java/Migrations.kt": src }, "android_x_sql_raw_query").status).toBe("PASS");
  });

  it("still fails when a variable is concatenated into the query", () => {
    const src = `public Cursor find(SQLiteDatabase db, String name) {
    return db.rawQuery("SELECT * FROM users WHERE name = '" + name + "'", null);
}`;
    expect(concatenatedSql(src)).toBe(true);
    expect(find({ "app/src/main/java/UserDao.java": src }, "android_x_sql_raw_query").status).toBe("FAIL");
  });

  it("still fails when a call result is concatenated", () => {
    expect(concatenatedSql(`db.rawQuery("SELECT * FROM t WHERE id = " + String.valueOf(id), null);`)).toBe(true);
  });

  it("still fails on a parenthesised operand", () => {
    expect(concatenatedSql(`db.rawQuery("SELECT * FROM t WHERE name = '" + (input) + "'", null);`)).toBe(true);
  });

  it("still fails on a Kotlin template inside a literal even when the other operand is a constant", () => {
    expect(concatenatedSql(`db.rawQuery("SELECT * FROM " + TABLE + " WHERE name = '$name'", null)`)).toBe(true);
    expect(concatenatedSql(`db.rawQuery("SELECT * FROM " + TABLE + " WHERE name = '\${user.name}'", null)`)).toBe(true);
  });

  it("still fails when the variable comes after a long column list (beyond 600 chars)", () => {
    const cols = Array.from({ length: 80 }, (_, i) => `col_${i}`).join(", ");
    const src = `db.rawQuery("SELECT ${cols} FROM t " + "WHERE a = 1 AND name = '" + userInput + "'", null);`;
    expect(src.length).toBeGreaterThan(600);
    expect(concatenatedSql(src)).toBe(true);
  });

  it("does not fail on a numeric literal operand", () => {
    expect(concatenatedSql(`db.rawQuery("SELECT * FROM t LIMIT " + 10, null);`)).toBe(false);
  });

  it("does not fail on a Contract constant", () => {
    expect(concatenatedSql(`db.rawQuery("SELECT * FROM t WHERE " + Contract.Entry.COLUMN_ID + " = ?", args);`)).toBe(false);
  });
});

describe("android_x_external_storage", () => {
  it("warns without claiming private data is written there", () => {
    const src = `public final class NewPipeSettings {
    private static File getDir(final String defaultDirectoryName) {
        return new File(Environment.getExternalStorageDirectory(), defaultDirectoryName);
    }
}`;
    const c = find({ "app/src/main/java/NewPipeSettings.java": src }, "android_x_external_storage");
    expect(c.status).toBe("WARN");
    expect(c.detail).not.toMatch(/The app writes to shared external storage/);
  });

  it("passes when no shared-storage API is used", () => {
    const src = `class Cache(private val context: Context) { val dir = context.filesDir }`;
    expect(find({ "app/src/main/java/Cache.kt": src }, "android_x_external_storage").status).toBe("PASS");
  });
});
