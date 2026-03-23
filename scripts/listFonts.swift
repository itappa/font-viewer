import AppKit

let manager = NSFontManager.shared
let families = manager.availableFontFamilies

for family in families.sorted() {
    let localizedName = manager.localizedName(forFamily: family, face: nil)
    if localizedName != family {
        print("\(family)\t\(localizedName)")
    } else {
        print("\(family)\t")
    }
}
