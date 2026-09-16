package ledger

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// D-19: the ledger is append-only in application code. This reads every
// non-test Go file under pkg/store and pkg/handlers and fails on a
// Delete/Save/Update against a ledger model, or raw SQL that edits a ledger
// table, outside the one method allowed to move an earning's status.

var ledgerModels = map[string]bool{
	"UserPoints":     true,
	"CreatorEarning": true,
	"ValueSource":    true,
	"EarningEvent":   true,
	"AdminAuditLog":  true,
}

var mutatingCalls = map[string]bool{
	"Delete": true, "Save": true, "Update": true, "Updates": true,
	"UpdateColumn": true, "UpdateColumns": true,
}

// allowed[func][model] — the only status write, which records its own event.
var allowed = map[string]map[string]bool{
	"TransitionEarning":    {"CreatorEarning": true},
	"MoveEarningsToPayout": {"CreatorEarning": true},
}

var rawLedgerSQL = regexp.MustCompile(`(?i)(delete\s+from|update)\s+` + "`?" +
	`(user_points|creator_earnings|value_sources|earning_events|admin_audit_logs)\b`)

func TestLedgerIsAppendOnly(t *testing.T) {
	roots := []string{"..", "../../handlers"}
	fset := token.NewFileSet()

	for _, root := range roots {
		err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
				return nil
			}
			file, err := parser.ParseFile(fset, path, nil, 0)
			if err != nil {
				return err
			}
			checkFile(t, fset, file)
			return nil
		})
		if err != nil {
			t.Fatalf("walk %s: %v", root, err)
		}
	}
}

func checkFile(t *testing.T, fset *token.FileSet, file *ast.File) {
	for _, decl := range file.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok || fn.Body == nil {
			continue
		}
		ast.Inspect(fn.Body, func(n ast.Node) bool {
			switch node := n.(type) {
			case *ast.BasicLit:
				if node.Kind == token.STRING && rawLedgerSQL.MatchString(node.Value) {
					t.Errorf("%s: raw SQL edits a ledger table in %s", fset.Position(node.Pos()), fn.Name.Name)
				}
			case *ast.CallExpr:
				sel, ok := node.Fun.(*ast.SelectorExpr)
				if !ok || !mutatingCalls[sel.Sel.Name] {
					return true
				}
				for model := range modelsInChain(node) {
					if allowed[fn.Name.Name][model] {
						continue
					}
					t.Errorf("%s: %s.%s on ledger model %s — write a reversing row instead (D-19)",
						fset.Position(node.Pos()), fn.Name.Name, sel.Sel.Name, model)
				}
			}
			return true
		})
	}
}

// modelsInChain finds `models.X{}` literals anywhere in a call chain such as
// tx.Model(&models.CreatorEarning{}).Where(...).Updates(...).
func modelsInChain(call *ast.CallExpr) map[string]bool {
	found := map[string]bool{}
	ast.Inspect(call, func(n ast.Node) bool {
		lit, ok := n.(*ast.CompositeLit)
		if !ok {
			return true
		}
		if sel, ok := lit.Type.(*ast.SelectorExpr); ok && ledgerModels[sel.Sel.Name] {
			found[sel.Sel.Name] = true
		}
		return true
	})
	return found
}
